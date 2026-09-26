// Cria um operador do painel administrativo de uma banca.
// Uso: pnpm operator:create --tenant aurora --name "Maria Souza" --email maria@banca.com --role MANAGER
// A senha vem de --password ou da variável OPERATOR_PASSWORD; se não for informada, uma senha forte é
// gerada e mostrada UMA vez. Executa com a credencial de migração (DATABASE_MIGRATOR_URL): a role de
// runtime da API não tem INSERT em operators.
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { OPERATOR_ROLES, passwordProblem } from '@sysjb/contracts';
import { createPrismaClient } from '@sysjb/database';
import { z } from 'zod';
import { PasswordService } from '../src/auth/password.service.js';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { values: args } = parseArgs({
  options: {
    tenant: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string' },
    password: { type: 'string' },
  },
  strict: true,
});

const input = z
  .strictObject({
    tenant: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'informe a banca (slug), ex.: --tenant aurora'),
    name: z.string().trim().min(2, 'informe o nome (2 a 120 caracteres)').max(120, 'nome muito longo'),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email('e-mail inválido')),
    role: z.enum(OPERATOR_ROLES, { error: `perfil inválido; use: ${OPERATOR_ROLES.join(', ')}` }),
  })
  .safeParse({ tenant: args.tenant, name: args.name, email: args.email, role: args.role });

if (!input.success) {
  for (const issue of input.error.issues)
    console.error(`Erro: ${issue.path.join('.') || 'argumentos'}: ${issue.message}`);
  process.exit(1);
}

const url = process.env.DATABASE_MIGRATOR_URL;
if (!url) {
  console.error('Erro: DATABASE_MIGRATOR_URL não definida (veja .env.example).');
  process.exit(1);
}

const provided = args.password ?? process.env.OPERATOR_PASSWORD;
const password = provided ?? randomBytes(18).toString('base64url');
const problem = passwordProblem(password);
if (problem) {
  console.error(`Erro: senha: ${problem}`);
  process.exit(1);
}

const prisma = createPrismaClient({ connectionString: url, max: 1 });
try {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: input.data.tenant },
    select: { id: true, active: true },
  });
  if (!tenant?.active) throw new Error(`banca "${input.data.tenant}" não encontrada ou inativa`);

  const passwordHash = await new PasswordService().hash(password);
  // A tabela tem RLS forçado: até a dona precisa informar a banca da transação.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
    await tx.operator.create({
      data: {
        tenantId: tenant.id,
        name: input.data.name,
        email: input.data.email,
        role: input.data.role,
        passwordHash,
      },
    });
  });

  console.log(`Operador criado: ${input.data.email} (${input.data.role}) na banca ${input.data.tenant}.`);
  if (!provided) console.log(`Senha gerada (mostrada só agora, guarde): ${password}`);
} catch (error) {
  const duplicate = error instanceof Error && 'code' in error && error.code === 'P2002';
  console.error(`Erro: ${duplicate ? 'já existe um operador com este e-mail nesta banca' : (error as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
