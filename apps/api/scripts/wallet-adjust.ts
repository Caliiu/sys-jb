// Ajuste manual de carteira (crédito ou estorno), registrado em wallet_entries com o motivo.
// Uso: pnpm wallet:adjust --tenant trevo --user 100008 --amount 1000 --note "Crédito de teste"
//      Estorno (valor negativo) usa "=": --amount=-50,25. Reais com vírgula ou ponto.
//      --bucket balance|prizes|bonus (padrão balance).
// Executa com a credencial de migração (DATABASE_MIGRATOR_URL): a role de runtime da API não altera
// carteiras. O banco recusa saldo negativo e qualquer carteira fora de conciliação com as movimentações.
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@sysjb/database';
import { z } from 'zod';

const rootEnv = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function readArgs() {
  try {
    return parseArgs({
      options: {
        tenant: { type: 'string' },
        user: { type: 'string' },
        amount: { type: 'string' },
        bucket: { type: 'string', default: 'balance' },
        note: { type: 'string' },
      },
      strict: true,
    }).values;
  } catch (error) {
    const negative = (error as { code?: string }).code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE';
    console.error(`Erro: ${negative ? 'para valor negativo use "=", ex.: --amount=-50,25' : (error as Error).message}`);
    process.exit(1);
  }
}

const args = readArgs();

const input = z
  .strictObject({
    tenant: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'informe a banca (slug), ex.: --tenant trevo'),
    user: z.coerce.number().int().positive('informe o ID do usuário (displayId), ex.: --user 100008'),
    amount: z
      .string()
      .regex(/^-?\d+([.,]\d{1,2})?$/, 'valor em reais, ex.: --amount 1000 ou --amount -50,25')
      .transform((v) => Math.round(Number(v.replace(',', '.')) * 100))
      .refine(
        (cents) => cents !== 0 && Math.abs(cents) <= 100_000_000,
        'valor deve ser diferente de zero e até R$ 1.000.000,00',
      ),
    bucket: z.enum(['balance', 'prizes', 'bonus'], { error: 'bolsa inválida; use: balance, prizes ou bonus' }),
    note: z
      .string({ error: 'informe o motivo, ex.: --note "Crédito de teste"' })
      .trim()
      .min(3, 'informe o motivo (3 a 200 caracteres)')
      .max(200, 'motivo muito longo'),
  })
  .safeParse(args);

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

const { tenant: slug, user: displayId, amount, bucket, note } = input.data;
const delta = { balance: 0n, prizes: 0n, bonus: 0n, [bucket]: BigInt(amount) };
const brl = (cents: bigint) => `R$ ${(Number(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const prisma = createPrismaClient({ connectionString: url, max: 1 });
try {
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) throw new Error(`banca "${slug}" não encontrada`);

  // Tabelas com RLS forçado: até a dona precisa informar a banca da transação.
  const wallet = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
    const user = await tx.user.findFirst({
      where: { tenantId: tenant.id, displayId },
      select: { id: true, name: true },
    });
    if (!user) throw new Error(`usuário ${displayId} não encontrado na banca ${slug}`);
    await tx.$executeRaw`SELECT wallet_manual_adjust(${user.id}::uuid, ${delta.balance}, ${delta.prizes}, ${delta.bonus}, ${note})`;
    const after = await tx.wallet.findFirstOrThrow({ where: { tenantId: tenant.id, userId: user.id } });
    return { name: user.name, ...after };
  });

  console.log(
    `Ajuste registrado para ${wallet.name} (${displayId}) na banca ${slug}: ${brl(BigInt(amount))} em ${bucket}.`,
  );
  console.log(`Saldo ${brl(wallet.balanceJb)} · prêmios ${brl(wallet.prizesJb)} · bônus ${brl(wallet.bonusJb)}`);
} catch (error) {
  const negative = error instanceof Error && /wallets_amounts_range|23514/.test(JSON.stringify(error));
  console.error(`Erro: ${negative ? 'o ajuste deixaria a carteira negativa' : (error as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
