// Gera .env a partir de .env.example trocando cada token "change-me-*" por um valor aleatório.
// O mesmo token recebe o mesmo valor em todas as ocorrências (ex.: senha e URL).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../.env', import.meta.url);
if (existsSync(target) && !process.argv.includes('--force')) {
  console.error('.env já existe. Use --force para sobrescrever.');
  process.exit(1);
}

const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const values = new Map();
const output = example.replace(/change-me-[a-z-]+/g, (token) => {
  // Token de webhook: o provedor de resultados aceita no máximo 32 caracteres.
  const bytes = token.endsWith('-webhook-token') ? 16 : 24;
  if (!values.has(token)) values.set(token, randomBytes(bytes).toString('hex'));
  return values.get(token);
});

writeFileSync(target, output);
console.log(`.env criado com ${values.size} segredos gerados.`);
