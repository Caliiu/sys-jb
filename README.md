# sys-jb

Estrutura inicial de um SaaS multi-banca (multi-tenant, white label): várias bancas com marca e domínio próprios no mesmo sistema. Esta etapa cobre **somente** infraestrutura mínima e cadastro, consulta e atualização de usuários com carteira zerada.

Fora do escopo desta etapa: apostas, resultados, sorteios, pagamentos, depósitos, saques, bônus, movimentação de carteira, integrações externas, login de clientes e CRUD de bancas.

## Estrutura

```text
apps/api             NestJS 12 (ESM): tenancy, users, carteira, health
apps/web             Next.js 16 + Tailwind 4: interface de demonstração (somente dev)
packages/contracts   Tipos públicos (PublicUser, PublicWallet, ApiError...), sem dependências de servidor
packages/database    Prisma 7: schema, migrations versionadas, seed e fábrica do client
docker/postgres      Script de init que cria as roles e os bancos
docker-compose.yml   PostgreSQL 17 para desenvolvimento
scripts/setup-env.mjs  Gera o .env com segredos aleatórios
```

## Pré-requisitos e versões

| Ferramenta | Versão usada |
| --- | --- |
| Node.js | 20.19+ (testado em 20.20.0) |
| pnpm | 10.34.5 (`packageManager` no package.json) |
| Docker + Compose | testado com Docker 29.5 / Compose 5.1 |
| PostgreSQL | 17.6 (imagem `postgres:17.6-alpine`) |
| TypeScript | 5.9.3 (strict) |
| NestJS | 12.1.0 (Express 5) |
| Next.js / React | 16.3.6 / 19.3.0 |
| Prisma | 7.10.0 com `@prisma/adapter-pg` |
| Tailwind CSS | 4.3.3 |
| Zod | 4.6.5 |
| Vitest | 4.1.11 |

Todas as dependências estão com versão exata e fixadas no `pnpm-lock.yaml`.

Sobre as versões: o `latest` do Prisma no npm aponta para um RC da 8, então foi fixada a 7.10.0 estável. O Vitest 5 exige Node 22, então foi usado o 4.1. O TypeScript 7 (port nativo) foi evitado em favor da 5.9.3 por causa dos decorators do NestJS.

## Como rodar

```bash
# 1. Dependências
pnpm install

# 2. .env com segredos aleatórios (a partir de .env.example)
pnpm setup:env

# 3. PostgreSQL (porta 5433 no host, para não conflitar com um Postgres local na 5432)
pnpm db:up

# 4. Build dos pacotes compartilhados (gera o Prisma Client) e migrations
pnpm --filter @sysjb/contracts build
pnpm --filter @sysjb/database build
pnpm db:migrate

# 5. Seed idempotente com as duas bancas fictícias
pnpm db:seed

# 6. Em dois terminais
pnpm dev:api     # http://127.0.0.1:4000
pnpm dev:web     # http://aurora.localhost:3000 e http://boreal.localhost:3000
```

Build, checagem de tipos e testes (o Postgres precisa estar rodando):

```bash
pnpm build       # contracts -> database -> api / web
pnpm typecheck
pnpm test        # testes de integração da API + verificação do bundle do web
```

Produção local da API: `pnpm --filter @sysjb/api build && pnpm --filter @sysjb/api start`.

### Hostnames locais

| Banca | Hostname | Cores |
| --- | --- | --- |
| Banca Aurora (`aurora`) | `aurora.localhost` | `#B4235A` / `#FDE7EF` |
| Banca Boreal (`boreal`) | `boreal.localhost` | `#0F5E9C` / `#E3F0FB` |

Chrome, Edge e Firefox resolvem `*.localhost` para o loopback sem configuração. Se o seu navegador não resolver, adicione ao arquivo hosts (`C:\Windows\System32\drivers\etc\hosts` ou `/etc/hosts`):

```text
127.0.0.1 aurora.localhost
127.0.0.1 boreal.localhost
```

A porta é sempre ignorada na resolução: `aurora.localhost:3000` (web) e `aurora.localhost:4000` (API) são a mesma banca.

### Credenciais de desenvolvimento

`pnpm setup:env` gera valores aleatórios para cada `change-me-*` do `.env.example`. As credenciais de serviço ficam em:

- `TENANT_SERVICE_KEYS` (API): `aurora=<chave>,boreal=<chave>`, indexadas pelo slug.
- `WEB_SERVICE_KEYS` (web, somente servidor): as mesmas chaves, indexadas pelo hostname.

Nenhuma variável usa o prefixo `NEXT_PUBLIC_`.

## API

Todas as rotas `/v1/*` exigem `Authorization: Bearer <chave da banca>` e resolvem a banca pelo header `Host`.

| Método | Rota | Comportamento |
| --- | --- | --- |
| POST | `/v1/users` | Cria usuário e carteira zerada na mesma transação. `201` com o contrato público |
| GET | `/v1/users/:id` | Consulta só dentro da banca atual |
| PATCH | `/v1/users/:id` | Atualiza apenas `name`, `email`, `phone`, `document`, `avatar` |
| GET | `/v1/tenant` | Nome e cores da banca atual (usado pela interface) |
| GET | `/health` | `{"status":"ok","database":"up"}`, sem credencial e sem expor segredos |

Exemplos (dados sintéticos; `$AURORA_KEY` é a chave da Aurora no seu `.env`):

```bash
curl -s http://127.0.0.1:4000/v1/users \
  -H "Host: aurora.localhost" \
  -H "Authorization: Bearer $AURORA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pessoa Exemplo","phone":"(11) 90000-0000","document":"000.000.000-00","email":null}'

curl -s http://127.0.0.1:4000/v1/users/<uuid> \
  -H "Host: aurora.localhost" -H "Authorization: Bearer $AURORA_KEY"

curl -s -X PATCH http://127.0.0.1:4000/v1/users/<uuid> \
  -H "Host: aurora.localhost" -H "Authorization: Bearer $AURORA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"pessoa@exemplo.test","avatar":null}'
```

Resposta (`201` / `200`):

```json
{
  "id": "<uuid gerado pelo servidor>",
  "name": "Pessoa Exemplo",
  "email": null,
  "phone": "11900000000",
  "document": "00000000000",
  "avatar": null,
  "displayId": 100000,
  "wallet": {
    "balanceJb": 0, "bonusJb": 0, "prizesJb": 0,
    "balanceGames": 0, "bonusGames": 0, "prizesGames": 0,
    "withdrawable": 0, "totalAvailableJb": 0, "totalAvailableGames": 0
  },
  "promoter": null,
  "promoterName": null,
  "promoterPhone": null
}
```

### Regras de entrada

- `name`: obrigatório, com trim, de 2 a 120 caracteres.
- `phone`: obrigatório. Aceita dígitos e separadores `()- .` e é salvo só com dígitos, no formato nacional: DDD + 8 dígitos (fixo) ou DDD + 9 + 8 dígitos (celular). O prefixo `+55` é rejeitado nesta fase.
- `document`: obrigatório. Aceita dígitos e separadores `./- ` e é salvo com 11 dígitos. **Só o formato é validado.** Não há verificação de identidade nem de validade fiscal.
- `email`: opcional/nullable, com trim e minúsculas.
- `avatar`: opcional/nullable, URL `http`/`https`. Não há upload e o servidor não baixa a URL.
- Telefone e documento são strings, então zeros à esquerda são preservados.
- Qualquer chave fora dessas cinco (ex.: `id`, `displayId`, `tenantId`, `wallet`, `promoter*`) retorna `400`.
- PATCH: campo ausente mantém o valor; `null` só é aceito em `email` e `avatar` (limpa); corpo vazio retorna `400`.

### Erros

Formato único, sem stack trace, SQL ou valores enviados: `{ "statusCode", "code", "message", "details"? }`. O `details` traz só nomes de campos.

| Status | `code` | Quando |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Payload/JSON/UUID inválido, campo não permitido, PATCH vazio |
| 401 | `UNAUTHORIZED` | Credencial ausente ou desconhecida |
| 403 | `FORBIDDEN` | Credencial válida de outra banca |
| 404 | `TENANT_NOT_FOUND` | Hostname sem banca ativa |
| 404 | `NOT_FOUND` | Usuário inexistente na banca atual (inclusive se existir em outra) |
| 409 | `CONFLICT` | Telefone, documento ou email já usado na banca, inclusive em corrida detectada pelo banco |
| 413 | `PAYLOAD_TOO_LARGE` | Corpo acima de 16 KB |

Os logs registram só método, caminho, status, duração e slug da banca. Nunca registram corpo, telefone, documento, email ou credenciais.

## Contrato monetário

- **Todo valor monetário é um inteiro em centavos** (`1050` = R$ 10,50). No banco são `bigint`, com CHECK de não negatividade e de soma ≤ `Number.MAX_SAFE_INTEGER`.
- `totalAvailableJb = balanceJb + bonusJb + prizesJb` e `totalAvailableGames = balanceGames + bonusGames + prizesGames`, calculados na leitura e não persistidos.
- `withdrawable` é sempre `0`: não existe regra de saque nesta fase.
- Os totais são só uma convenção de apresentação e **não** definem elegibilidade para apostas ou saques.
- A carteira é só leitura: não há endpoint de alteração, a role de runtime não tem `UPDATE` em `wallets` e um trigger exige saldo zero na criação.
- `promoter`, `promoterName` e `promoterPhone` são sempre `null`. Estão centralizados no contrato (`PublicPromoterFields`) e no mapper (`promoterFields()`) para evolução futura.
- Campos nullable sempre aparecem como `null`, nunca são omitidos. O objeto público não inclui `tenantId` nem timestamps.

## Isolamento entre bancas

1. **Resolução por hostname**: allowlist exata contra `tenants.domain`, com minúsculas, sem ponto final e sem porta. Hostname desconhecido ou banca inativa retorna `404`, sem fallback. `tenantId` em body é rejeitado; em query ou header é ignorado.
2. **X-Forwarded-Host** só é considerado com `API_TRUST_PROXY` apontando para um proxy explícito (ex.: `loopback`). O padrão é `false`, e `true` é recusado.
3. **Serviço/repositório**: toda consulta a `users`/`wallets` passa por `DatabaseService.withTenant` e filtra `tenantId` explicitamente.
4. **RLS no PostgreSQL** (segunda camada): `ENABLE` + `FORCE ROW LEVEL SECURITY` em `users` e `wallets`, com políticas `USING` e `WITH CHECK` em `tenant_id = app_current_tenant_id()`. O contexto é definido com `set_config('app.tenant_id', <uuid>, true)`, local à transação e na mesma conexão das consultas. Ao fim da transação o valor é descartado, então não vaza pelo pool. Sem contexto, nenhuma linha é visível e nenhuma escrita passa.
5. **FKs compostas**: `wallets(tenant_id, user_id) → users(tenant_id, id)` impede carteira de uma banca apontar para usuário de outra.

### Roles do PostgreSQL

| Role | Uso | Atributos |
| --- | --- | --- |
| `postgres` | Só o init do container | superuser |
| `sysjb_migrator` | Migrations, seed e setup dos testes (`DATABASE_MIGRATOR_URL`) | dona do schema e das tabelas; `CREATEDB` para o shadow DB do `prisma migrate dev`; sem superuser |
| `sysjb_app` | Runtime da API (`DATABASE_URL`) | `NOSUPERUSER`, `NOBYPASSRLS`, não é dona de nada. `SELECT` em `tenants`; `SELECT`/`INSERT`/`UPDATE` (só colunas editáveis) em `users`; `SELECT`/`INSERT` em `wallets`; sem `DELETE`; não pode escolher `id` nem `displayId` |

`displayId` vem de uma sequence do PostgreSQL (começa em 100000). Aceita lacunas e é `int4`, portanto sempre um inteiro seguro em JSON.

## Limitação de autenticação (importante)

A credencial de serviço por banca é uma **proteção provisória para integração e desenvolvimento local**. Ela **não substitui** autenticação e autorização de clientes e administradores, que ficam para uma etapa posterior.

A interface web:

- chama a API somente do servidor (server actions e `server-only`); as chaves nunca vão ao navegador, e `pnpm --filter @sysjb/web test` verifica isso no bundle;
- escuta só em `127.0.0.1` e só atende hostnames `*.localhost`;
- fica desabilitada com `NODE_ENV=production` (página e server actions), enquanto não houver autenticação real.

Nada é publicado nem implantado automaticamente.

## Testes

`apps/api/test` roda contra PostgreSQL real (`sysjb_test`, recriado a cada execução pelas mesmas migrations), com dados sintéticos:

| # | Risco | Arquivo |
| --- | --- | --- |
| 1 | Cadastro persiste usuário + exatamente uma carteira zerada; contrato completo | `users.test.ts` |
| 2 | Falha na carteira desfaz o cadastro; banco recusa carteira não zerada | `users.test.ts` |
| 3 | Duplicidade de telefone/documento/email na banca → 409 (inclusive concorrente); em outra banca é permitido | `uniqueness.test.ts` |
| 4 | GET/PATCH não alcançam usuário de outra banca; `tenantId` em query/header é ignorado | `tenancy.test.ts` |
| 5 | Role de runtime sem superuser/BYPASSRLS; RLS bloqueia leitura/escrita cruzada e acesso sem contexto; FK composta | `rls.test.ts` |
| 6 | Transações e requisições concorrentes alternadas (pool de 2 conexões) não herdam contexto | `rls.test.ts` |
| 7 | Campos protegidos rejeitados; PATCH ausente × null | `users.test.ts` |
| 8 | Cadastros concorrentes recebem displayIds distintos | `uniqueness.test.ts` |
| 9 | Credencial de uma banca não autoriza outra (`tenancy.test.ts`); chaves e um canário ausentes do bundle do navegador (`apps/web/scripts/check-client-bundle.mjs`) | ambos |

## Decisões

- **NestJS 12 é ESM-only.** A API usa `"type": "module"` e injeção com `@Inject(...)` explícito em todos os construtores, sem depender de `emitDecoratorMetadata`. Assim tsx (dev), tsc (build) e Vitest funcionam sem SWC.
- **Validação com Zod** (`z.strictObject`) em vez de class-validator, pelo mesmo motivo e para rejeitar chaves desconhecidas.
- **Prisma 7 com driver adapter `pg`**. O contexto de tenant usa transação interativa (`$transaction`), que garante a mesma conexão para `set_config` e as consultas.
- **O Prisma envia defaults estáticos no INSERT.** Por isso a role de runtime tem INSERT nas colunas de saldo, e um trigger (`wallets_zero_on_insert`) garante carteira zerada. Remova-o quando existir movimentação auditada.
- **`GET /v1/tenant`** foi acrescentado (fora da tabela mínima) para a interface exibir nome e cores sem acessar o banco diretamente.
- **O web chama a API com `node:http`**, porque o `fetch` não permite definir o header `Host`, que é o que identifica a banca.
- **Docker Compose só com o PostgreSQL.** API e web rodam com `pnpm` para manter a resolução por `*.localhost` simples no desenvolvimento.
- **`prisma migrate reset`** recria o schema `public`. A migration de segurança reaplica o `GRANT USAGE` para a role de runtime.

## Limitações restantes

- Sem autenticação de clientes/administradores (ver acima).
- Redis e BullMQ só previstos; não há filas nem dependências instaladas.
- Resolução de banca consulta o banco a cada requisição (sem cache).
- Sem rate limiting, CORS configurado ou headers de segurança adicionais na API, pois ela não é exposta ao navegador nesta fase.
- Telefone só no formato nacional brasileiro; documento só com validação de formato.
