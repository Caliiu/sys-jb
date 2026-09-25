// Verificação 9: credenciais não podem aparecer no que é servido ao navegador.
// 1. Carrega o .env da raiz (as chaves ficam disponíveis no processo do build, como em produção).
// 2. Acrescenta uma chave-canário e roda `next build`.
// 3. Varre .next/static (JS/CSS do cliente) procurando qualquer segredo.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const rootEnv = path.resolve(webDir, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const canary = `canary${randomBytes(16).toString('hex')}`;
const webKeys = [process.env.WEB_SERVICE_KEYS, `canary.localhost=${canary}`].filter(Boolean).join(',');

const build = spawnSync('pnpm', ['exec', 'next', 'build'], {
  cwd: webDir,
  env: { ...process.env, WEB_SERVICE_KEYS: webKeys, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (build.status !== 0) {
  console.error('next build falhou');
  process.exit(1);
}

const secrets = new Set([canary]);
for (const name of ['WEB_SERVICE_KEYS', 'TENANT_SERVICE_KEYS']) {
  for (const pair of (process.env[name] ?? '').split(',')) {
    const value = pair.slice(pair.indexOf('=') + 1).trim();
    if (value.length >= 16) secrets.add(value);
  }
}
for (const name of ['SYSJB_APP_PASSWORD', 'SYSJB_MIGRATOR_PASSWORD', 'POSTGRES_SUPERUSER_PASSWORD']) {
  if ((process.env[name] ?? '').length >= 16) secrets.add(process.env[name]);
}
const forbiddenNames = ['WEB_SERVICE_KEYS', 'TENANT_SERVICE_KEYS', 'DATABASE_URL', 'Bearer '];

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* files(full);
    else yield full;
  }
}

const staticDir = path.join(webDir, '.next', 'static');
let scanned = 0;
const leaks = [];
for (const file of files(staticDir)) {
  const content = readFileSync(file, 'utf8');
  scanned += 1;
  for (const s of secrets) if (content.includes(s)) leaks.push(`${path.relative(webDir, file)}: segredo`);
  for (const n of forbiddenNames) if (content.includes(n)) leaks.push(`${path.relative(webDir, file)}: referência a ${n}`);
}

if (scanned === 0) {
  console.error('nenhum arquivo em .next/static: verificação inválida');
  process.exit(1);
}
if (leaks.length) {
  console.error(`FALHA: ${leaks.length} ocorrência(s) no bundle do navegador:\n${leaks.join('\n')}`);
  process.exit(1);
}
console.log(`OK: ${scanned} arquivos do cliente verificados, ${secrets.size} segredos (incluindo canário) ausentes.`);
