import { timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Errors } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig, digestKey } from '../config/config.js';
import { normalizeHost } from './host.js';
import { TenantResolverService } from './tenant-resolver.service.js';
import type { ResolvedTenant, TenantRequest } from './tenant.types.js';

/**
 * Proteção provisória para integração/local: credencial de serviço por banca.
 * NÃO substitui autenticação/autorização de clientes e administradores.
 *
 * Ordem: 401 (credencial ausente/desconhecida) -> 404 (hostname sem banca ativa)
 * -> 403 (credencial válida, mas de outra banca). A banca vem SEMPRE do hostname;
 * tenantId em body/query/header nunca é aceito.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TenantResolverService) private readonly resolver: TenantResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();

    const keySlug = this.matchServiceKey(req.headers.authorization);
    if (!keySlug) throw Errors.unauthorized();

    // req.hostname só considera X-Forwarded-Host quando "trust proxy" aponta para um proxy confiável.
    const host = normalizeHost(req.hostname);
    const tenant = host ? await this.resolver.resolveByHost(host) : null;
    if (!tenant) throw Errors.tenantNotFound();

    if (tenant.slug !== keySlug) throw Errors.forbidden();

    req.tenant = tenant;
    return true;
  }

  /** Compara digests em tempo constante contra todas as chaves, sem interromper no primeiro acerto. */
  private matchServiceKey(authorization: string | undefined): string | null {
    const match = /^Bearer ([\x21-\x7e]{1,512})$/.exec(authorization ?? '');
    if (!match?.[1]) return null;
    const presented = digestKey(match[1]);
    let found: string | null = null;
    for (const entry of this.config.serviceKeys) {
      if (timingSafeEqual(presented, entry.digest)) found = entry.tenantSlug;
    }
    return found;
  }
}

export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext): ResolvedTenant => {
  const tenant = ctx.switchToHttp().getRequest<TenantRequest>().tenant;
  if (!tenant) throw Errors.internal();
  return tenant;
});
