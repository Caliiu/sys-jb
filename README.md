# sys-jb

Estrutura inicial de um SaaS multi-banca (multi-tenant, white label): várias bancas com marca e domínio próprios no mesmo sistema. Esta etapa cobre **somente** infraestrutura mínima e cadastro, consulta e atualização de usuários com carteira zerada.

Fora do escopo desta etapa: apostas, resultados, sorteios, pagamentos, depósitos, saques, bônus, movimentação de carteira, integrações externas, login de clientes e CRUD de bancas.

## Estrutura

```text
apps/api             NestJS 12 (ESM): tenancy, users, carteira, health
apps/web             Next.js 16 + Tailwind 4: cadastro, login, "Minha conta" e ferramentas de dev
packages/contracts   Tipos públicos (PublicUser, PublicWallet, ApiError...), sem dependências de servidor
packages/database    Prisma 7: schema, migrations versionadas, seed e fábrica do client
docker/postgres      Script de init que cria as roles e os bancos
docker-compose.yml   PostgreSQL 17 para desenvolvimento
scripts/setup-env.mjs  Gera o .env com segredos aleatórios
```

## Pré-requisitos e versões

| Ferramenta       | Versão usada                               |
| ---------------- | ------------------------------------------ |
| Node.js          | 20.19+ (testado em 20.20.0)                |
| pnpm             | 10.34.5 (`packageManager` no package.json) |
| Docker + Compose | testado com Docker 29.5 / Compose 5.1      |
| PostgreSQL       | 17.6 (imagem `postgres:17.6-alpine`)       |
| TypeScript       | 5.9.3 (strict)                             |
| NestJS           | 12.1.0 (Express 5)                         |
| Next.js / React  | 16.3.6 / 19.3.0                            |
| Prisma           | 7.10.0 com `@prisma/adapter-pg`            |
| Tailwind CSS     | 4.3.3                                      |
| Zod              | 4.6.5                                      |
| Vitest           | 4.1.11                                     |

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

# 5. Seed idempotente com as três bancas fictícias
pnpm db:seed

# 6. Em dois terminais
pnpm dev:api     # http://127.0.0.1:4000
pnpm dev:web     # http://aurora.localhost:3000/cadastro e http://boreal.localhost:3000/login
```

Build, checagem de tipos e testes (o Postgres precisa estar rodando):

```bash
pnpm build        # contracts -> database -> api / web
pnpm typecheck
pnpm lint         # ESLint do web (Next, hooks do React e acessibilidade)
pnpm format:check # Prettier em todo o repositório (pnpm format para corrigir)
pnpm test         # integração da API + componentes do web + verificação do bundle
```

Produção local da API: `pnpm --filter @sysjb/api build && pnpm --filter @sysjb/api start`.

### Hostnames locais

| Banca                    | Hostname           | Cores                                                    |
| ------------------------ | ------------------ | -------------------------------------------------------- |
| Trevo da Sorte (`trevo`) | `trevo.localhost`  | `#DF2120` / `#F4F1EA`, logo em `apps/web/public/brands/` |
| Banca Aurora (`aurora`)  | `aurora.localhost` | `#B4235A` / `#FDE7EF`                                    |
| Banca Boreal (`boreal`)  | `boreal.localhost` | `#0F5E9C` / `#E3F0FB`                                    |

Chrome, Edge e Firefox resolvem `*.localhost` para o loopback sem configuração. Se o seu navegador não resolver, adicione ao arquivo hosts (`C:\Windows\System32\drivers\etc\hosts` ou `/etc/hosts`):

```text
127.0.0.1 trevo.localhost
127.0.0.1 aurora.localhost
127.0.0.1 boreal.localhost
```

A porta é sempre ignorada na resolução: `aurora.localhost:3000` (web) e `aurora.localhost:4000` (API) são a mesma banca.

### Credenciais de desenvolvimento

`pnpm setup:env` gera valores aleatórios para cada `change-me-*` do `.env.example`. As credenciais de serviço ficam em:

- `TENANT_SERVICE_KEYS` (API): `aurora=<chave>,boreal=<chave>`, indexadas pelo slug.
- `WEB_SERVICE_KEYS` (web, somente servidor): as mesmas chaves, indexadas pelo hostname.

- `AUTH_SECRET` (API): chave HMAC do bloqueio de tentativas de login.

Nenhuma variável usa o prefixo `NEXT_PUBLIC_`.

Se você já tinha um `.env` de antes do login, acrescente só `AUTH_SECRET` (ex.: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). Não rode `pnpm setup:env --force`: ele troca as senhas do banco, e o volume existente continuaria com as antigas.

## API

Todas as rotas `/v1/*` exigem `Authorization: Bearer <chave da banca>` e resolvem a banca pelo header `Host`.

| Método | Rota              | Comportamento                                                                   |
| ------ | ----------------- | ------------------------------------------------------------------------------- |
| POST   | `/v1/users`       | Cria usuário e carteira zerada na mesma transação. `201` com o contrato público |
| GET    | `/v1/users/:id`   | Consulta só dentro da banca atual                                               |
| PATCH  | `/v1/users/:id`   | Atualiza apenas `name`, `email`, `phone`, `document`, `avatar`                  |
| POST   | `/v1/auth/login`  | Login por CPF + senha. `200` com `{ token, expiresAt, user }`                   |
| GET    | `/v1/me`          | Usuário da sessão (header `X-Session-Token`)                                    |
| POST   | `/v1/auth/logout` | Revoga a sessão do `X-Session-Token`. `204`, idempotente                        |
| GET    | `/v1/tenant`      | Nome e cores da banca atual (usado pela interface)                              |
| GET    | `/health`         | `{"status":"ok","database":"up"}`, sem credencial e sem expor segredos          |

Exemplos (dados sintéticos; `$AURORA_KEY` é a chave da Aurora no seu `.env`; o CPF `529.982.247-25` é um número de teste amplamente usado):

```bash
curl -s http://127.0.0.1:4000/v1/users \
  -H "Host: aurora.localhost" \
  -H "Authorization: Bearer $AURORA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pessoa Exemplo","phone":"(11) 90000-0000","document":"529.982.247-25","birthDate":"1990-05-17","password":"uma frase secreta longa","email":null}'

curl -s http://127.0.0.1:4000/v1/auth/login \
  -H "Host: aurora.localhost" -H "Authorization: Bearer $AURORA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"document":"529.982.247-25","password":"uma frase secreta longa"}'

curl -s http://127.0.0.1:4000/v1/me \
  -H "Host: aurora.localhost" -H "Authorization: Bearer $AURORA_KEY" \
  -H "X-Session-Token: <token do login>"

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
  "document": "52998224725",
  "avatar": null,
  "displayId": 100000,
  "wallet": {
    "balanceJb": 0,
    "bonusJb": 0,
    "prizesJb": 0,
    "balanceGames": 0,
    "bonusGames": 0,
    "prizesGames": 0,
    "withdrawable": 0,
    "totalAvailableJb": 0,
    "totalAvailableGames": 0
  },
  "promoter": null,
  "promoterName": null,
  "promoterPhone": null
}
```

### Regras de entrada

- `name`: obrigatório, com trim, de 2 a 120 caracteres.
- `phone`: obrigatório. Aceita dígitos e separadores `()- .` e é salvo só com dígitos, no formato nacional: DDD + 8 dígitos (fixo) ou DDD + 9 + 8 dígitos (celular). O prefixo `+55` é rejeitado nesta fase.
- `document` (CPF): obrigatório. Aceita dígitos e separadores `./- ` e é salvo com 11 dígitos. São validados os **dígitos verificadores** (na API e por CHECK no banco) e sequências repetidas são rejeitadas. Isso **não** é verificação de identidade nem de situação fiscal.
- `birthDate`: obrigatório no cadastro, `YYYY-MM-DD`, data real. Exige **18 anos completos** na data de hoje em Brasília (quem nasceu em 29/02 completa em 01/03). Não aparece no contrato público e não é editável pelo PATCH.
- `password`: obrigatória no cadastro, 8 a 128 caracteres, sem regras de composição (NIST SP 800-63B). Recusa senhas muito comuns e senhas que contenham CPF, telefone ou data de nascimento. Guardada só como hash **argon2id** (19 MiB, 2 iterações) e nunca devolvida nem editável pelo PATCH nesta etapa.
- `email`: opcional/nullable, com trim e minúsculas.
- `avatar`: opcional/nullable, URL `http`/`https`. Não há upload e o servidor não baixa a URL.
- Telefone e CPF são strings, então zeros à esquerda são preservados.
- POST aceita só `name`, `phone`, `document`, `birthDate`, `password`, `email` e `avatar`. Qualquer outra chave (ex.: `id`, `displayId`, `tenantId`, `wallet`, `promoter*`) retorna `400`.
- PATCH aceita só `name`, `email`, `phone`, `document` e `avatar`. Campo ausente mantém o valor; `null` só é aceito em `email` e `avatar` (limpa); corpo vazio retorna `400`.

### Erros

Formato único, sem stack trace, SQL ou valores enviados: `{ "statusCode", "code", "message", "details"? }`. O `details` traz só nomes de campos.

| Status | `code`                | Quando                                                                              |
| ------ | --------------------- | ----------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`    | Payload/JSON/UUID inválido, campo não permitido, PATCH vazio                        |
| 401    | `UNAUTHORIZED`        | Credencial de serviço ausente ou desconhecida                                       |
| 401    | `INVALID_CREDENTIALS` | Login com CPF ou senha inválidos (mesma resposta para os dois casos)                |
| 401    | `SESSION_INVALID`     | Token de sessão ausente, malformado, expirado, revogado ou de outra banca           |
| 403    | `FORBIDDEN`           | Credencial de serviço válida de outra banca                                         |
| 404    | `TENANT_NOT_FOUND`    | Hostname sem banca ativa                                                            |
| 404    | `NOT_FOUND`           | Usuário inexistente na banca atual (inclusive se existir em outra)                  |
| 409    | `CONFLICT`            | Telefone, CPF ou email já usado na banca, inclusive em corrida detectada pelo banco |
| 413    | `PAYLOAD_TOO_LARGE`   | Corpo acima de 16 KB                                                                |
| 429    | `TOO_MANY_ATTEMPTS`   | CPF bloqueado temporariamente por falhas de login; vem com `Retry-After`            |

Os logs registram só método, caminho, status, duração e slug da banca. Nunca registram corpo, telefone, CPF, email, senha, token ou credenciais.

## Login de clientes

- **Identificador**: CPF + senha, por banca. O mesmo CPF em outra banca é outra conta, com outra senha.
- **Resposta igual para CPF inexistente e senha errada**, inclusive no tempo: CPF inexistente é verificado contra um hash descartável.
- **Sessão**: token opaco de 256 bits, válido por **12 horas** (absoluto). O banco guarda só o SHA-256 do token (`sessions`), com RLS por banca. Logout marca `revoked_at`.
- **Bloqueio**: 5 falhas para o mesmo CPF em 15 minutos bloqueiam novas tentativas (`429` + `Retry-After`), mesmo com a senha certa. CPFs inexistentes também são contados, para o bloqueio não revelar quais estão cadastrados. As falhas guardam só um HMAC do CPF (`AUTH_SECRET`), e um login bem-sucedido zera o contador.
- **No web**: o servidor Next chama o login e guarda o token num cookie `HttpOnly` (`SameSite=Lax`, `Secure` em produção). O navegador recebe só os dados do usuário; o token nunca fica acessível a JavaScript. Cada hostname de banca tem o seu cookie.
- A credencial de serviço continua obrigatória em todas as rotas: só o servidor do web (ou outro serviço confiável) fala com a API.

## Dashboard

`/` é o Dashboard do app original (`trv-clone/frontend`, função `Dashboard` do `App.tsx`), com os mesmos componentes e o mesmo visual em `apps/web/components/dashboard/`. Sem sessão, `/` redireciona para `/login`, como o `ProtectedRoute` original.

Adaptações ao que existe hoje no backend:

| No original                                    | Aqui                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Bolsas `LOTERIAS`, `BONUS`, `GAMES`            | **Saldo** = `balanceJb + prizesJb`, **BÔNUS** = `bonusJb`, **Disp. Games** = `totalAvailableGames` (centavos)                          |
| Modalidades ativas vindas da API               | Lista fixa com as 5 modalidades, sem banner (`lib/modalities.ts`)                                                                      |
| Logo fixo `logo.svg`                           | Logo da banca (`logoUrl`) ou a inicial do nome                                                                                         |
| `unitId` fixo                                  | `displayId` do usuário                                                                                                                 |
| Link de convite fixo e QR ilustrativo          | `<domínio da banca>/cadastro?convite=<displayId>` com QR real. O texto não promete recompensa: o crédito da indicação ainda não existe |
| Botões sem destino (tiles, abas, menu, rodapé) | Avisam "disponível em breve" (toast), em vez de não fazer nada                                                                         |
| Próximo sorteio com contador fixo              | Contador real (`nextDraw`); sem sorteio cadastrado, o banner não aparece                                                               |

O título da aba, o ícone (logo ou a inicial na cor da banca) e a cor da barra do navegador no celular vêm da banca. As ferramentas de desenvolvimento (consulta/edição por UUID) ficam em `/dev`, só em desenvolvimento.

Correções em relação ao original:

- **Barra superior** `sticky` em CSS: o conteúdo não fica escondido atrás dela antes do JavaScript carregar (o original media a altura com JS).
- **Menu e modal acessíveis**: `role="dialog"`, Esc fecha, o foco entra no painel e volta para quem abriu, a página por trás não rola, e fechados ficam `inert` (fora do Tab e dos leitores de tela).
- **Convite**: copiar/compartilhar tratam falhas (sem permissão, compartilhamento cancelado); o modal só é baixado quando aberto.
- **Saldo**: sessão expirada leva ao login; valores com separador de milhar (`1.234,56`).
- Safe areas do iPhone na barra inferior e no modal.

### Organização do web

```text
app/                 rotas (Next App Router) e server actions
views/               telas completas (LoginPage, RegisterPage, DashboardPage)
components/auth/     AuthLayout, AuthInput, FormError
components/dashboard/ componentes do Dashboard, InviteProvider, TopBar
components/tenant/   TenantProvider, TenantLogo (white label)
components/ui/       Toast, QrCode, Notice
components/dev/      ferramentas de /dev
hooks/               useAuth, useWallet, useOverlay, useCountdown
lib/                 cliente da API (server-only), sessão, máscaras, moeda, marca
schemas/             validação dos formulários (regras de @sysjb/contracts)
```

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
4. **RLS no PostgreSQL** (segunda camada): `ENABLE` + `FORCE ROW LEVEL SECURITY` em `users`, `wallets`, `sessions` e `login_failures`, com políticas `USING` e `WITH CHECK` em `tenant_id = app_current_tenant_id()`. O contexto é definido com `set_config('app.tenant_id', <uuid>, true)`, local à transação e na mesma conexão das consultas. Ao fim da transação o valor é descartado, então não vaza pelo pool. Sem contexto, nenhuma linha é visível e nenhuma escrita passa.
5. **FKs compostas**: `wallets(tenant_id, user_id)` e `sessions(tenant_id, user_id) → users(tenant_id, id)` impedem carteira ou sessão de uma banca apontar para usuário de outra.

### Roles do PostgreSQL

| Role             | Uso                                                           | Atributos                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`       | Só o init do container                                        | superuser                                                                                                                                                                                                                                                                                                                                                                              |
| `sysjb_migrator` | Migrations, seed e setup dos testes (`DATABASE_MIGRATOR_URL`) | dona do schema e das tabelas; `CREATEDB` para o shadow DB do `prisma migrate dev`; sem superuser                                                                                                                                                                                                                                                                                       |
| `sysjb_app`      | Runtime da API (`DATABASE_URL`)                               | `NOSUPERUSER`, `NOBYPASSRLS`, não é dona de nada. `SELECT` em `tenants`; `SELECT`/`INSERT`/`UPDATE` (só colunas editáveis; senha e nascimento só no INSERT) em `users`; `SELECT`/`INSERT` em `wallets`; `SELECT`/`INSERT` e `UPDATE` só de `revoked_at` em `sessions`; `SELECT`/`INSERT`/`DELETE` em `login_failures`; sem `DELETE` nas demais; não pode escolher `id` nem `displayId` |

`displayId` vem de uma sequence do PostgreSQL (começa em 100000). Aceita lacunas e é `int4`, portanto sempre um inteiro seguro em JSON.

## Limitação de autorização (importante)

Os clientes já fazem login, mas `GET`/`PATCH /v1/users/:id` continuam protegidos **só pela credencial de serviço**: qualquer detentor da chave consulta e edita qualquer usuário da banca. Isso serve para integração e desenvolvimento local e **não substitui** autorização de administradores, que fica para uma etapa posterior.

Por isso o web separa duas coisas:

- **Telas do cliente** (`/cadastro`, `/login` e o Dashboard em `/`): funcionam em qualquer ambiente, para qualquer hostname com credencial configurada em `WEB_SERVICE_KEYS`.
- **Ferramentas de desenvolvimento** (consulta e edição por UUID em `/dev`): só com `NODE_ENV` diferente de `production` e em hostnames `*.localhost`, porque usam só a credencial de serviço, sem login de administrador.

Nos dois casos o web chama a API somente do servidor (server actions e `server-only`): as chaves nunca vão ao navegador, e `pnpm --filter @sysjb/web test` verifica isso no bundle. Os scripts `dev` e `start` escutam só em `127.0.0.1`.

## Telas de cadastro e login

`/cadastro` e `/login` são as páginas do app original (`trv-clone/frontend`), em `apps/web/views/`. Mudou só o roteador (Next no lugar de react-router) e, no login, o campo "CPF ou Telefone" virou "CPF", porque o login é só por CPF.

- `components/auth/AuthLayout.tsx` e `components/auth/AuthInput.tsx`: os originais. No layout, o logo e a cor primária vêm da banca (`logoUrl`, ou o nome quando não há logo). "Dúvidas?", "Fale com o suporte" e "Esqueceu sua senha?" avisam que vêm em breve.
- `lib/masks.ts`: máscaras de telefone, CPF e data (DD/MM/AAAA).
- `schemas/register.schema.ts` e `schemas/login.schema.ts`: validação no navegador, com as **mesmas regras da API** (importadas de `@sysjb/contracts`). A API continua sendo a validação oficial.
- `hooks/useAuth.ts`: `register`, `login` e `logout` sobre server actions (`app/auth-actions.ts`); falhas viram `ApiError` com mensagem pronta.

Depois do cadastro, a tela vai para `/login` com o aviso "Cadastro concluído"; depois do login, para `/`. Quem já está logado e abre `/login` ou `/cadastro` é redirecionado para `/`.

O tema é o do `tailwind.config.js`/`index.css` original, em `app/globals.css`: cores `brand-*`, `shadow-card`, `app-shell` e as fontes Archivo Black e Inter (via `next/font`). A diferença, por ser white label, é que `brand-primary` vem da banca, e `primaryDark`/`primaryLight` são derivados dela. A banca Trevo da Sorte usa o vermelho original.

Nada é publicado nem implantado automaticamente.

## Testes

`apps/api/test` roda contra PostgreSQL real (`sysjb_test`, recriado a cada execução pelas mesmas migrations), com dados sintéticos:

| #   | Risco                                                                                                                                                                                                  | Arquivo              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| 1   | Cadastro persiste usuário + exatamente uma carteira zerada; contrato completo                                                                                                                          | `users.test.ts`      |
| 2   | Falha na carteira desfaz o cadastro; banco recusa carteira não zerada                                                                                                                                  | `users.test.ts`      |
| 3   | Duplicidade de telefone/documento/email na banca → 409 (inclusive concorrente); em outra banca é permitido                                                                                             | `uniqueness.test.ts` |
| 4   | GET/PATCH não alcançam usuário de outra banca; `tenantId` em query/header é ignorado                                                                                                                   | `tenancy.test.ts`    |
| 5   | Role de runtime sem superuser/BYPASSRLS; RLS bloqueia leitura/escrita cruzada e acesso sem contexto; FK composta                                                                                       | `rls.test.ts`        |
| 6   | Transações e requisições concorrentes alternadas (pool de 2 conexões) não herdam contexto                                                                                                              | `rls.test.ts`        |
| 7   | Campos protegidos rejeitados; PATCH ausente × null                                                                                                                                                     | `users.test.ts`      |
| 8   | Cadastros concorrentes recebem displayIds distintos                                                                                                                                                    | `uniqueness.test.ts` |
| 9   | Credencial de uma banca não autoriza outra (`tenancy.test.ts`); chaves e um canário ausentes do bundle do navegador (`apps/web/scripts/check-client-bundle.mjs`)                                       | ambos                |
| —   | CPF com dígitos verificadores, maioridade, regras de senha, hash argon2id; login, resposta igual para CPF inexistente, bloqueio com `Retry-After`, sessão por banca, expiração, logout, RLS de sessões | `auth.test.ts`       |

`apps/web` tem testes de componentes (Vitest + Testing Library + jsdom) para máscaras, moeda, schemas, login e cadastro, menu lateral (inert, Esc, foco), convite (QR, cópia com falha, compartilhamento cancelado), saldo (oculto, erro, sessão expirada) e contador do sorteio.

## Decisões

- **NestJS 12 é ESM-only.** A API usa `"type": "module"` e injeção com `@Inject(...)` explícito em todos os construtores, sem depender de `emitDecoratorMetadata`. Assim tsx (dev), tsc (build) e Vitest funcionam sem SWC.
- **Validação com Zod** (`z.strictObject`) em vez de class-validator, pelo mesmo motivo e para rejeitar chaves desconhecidas.
- **Prisma 7 com driver adapter `pg`**. O contexto de tenant usa transação interativa (`$transaction`), que garante a mesma conexão para `set_config` e as consultas.
- **O Prisma envia defaults estáticos no INSERT.** Por isso a role de runtime tem INSERT nas colunas de saldo, e um trigger (`wallets_zero_on_insert`) garante carteira zerada. Remova-o quando existir movimentação auditada.
- **`GET /v1/tenant`** foi acrescentado (fora da tabela mínima) para a interface exibir nome e cores sem acessar o banco diretamente.
- **O web chama a API com `node:http`**, porque o `fetch` não permite definir o header `Host`, que é o que identifica a banca.
- **Docker Compose só com o PostgreSQL.** API e web rodam com `pnpm` para manter a resolução por `*.localhost` simples no desenvolvimento.
- **`prisma migrate reset`** recria o schema `public`. A migration de segurança reaplica o `GRANT USAGE` para a role de runtime.
- **Data de nascimento fora do contrato público**, para manter o formato combinado do objeto de usuário. Se a interface precisar exibi-la, o contrato deve ganhar o campo de forma explícita.
- **argon2id com `@node-rs/argon2`** (binários pré-compilados, sem build nativo). O hash roda fora da transação para não segurar conexão do pool.
- **Bloqueio de login no PostgreSQL** (`login_failures`) em vez de memória, para valer com mais de uma instância da API. Com Redis, pode migrar para lá.
- **A migration `auth` exige a tabela `users` vazia**, porque `birth_date` e `password_hash` são obrigatórios e não há como inventá-los. O ambiente ainda não tem dados reais.

## Limitações restantes

- Sem login de administradores; `GET`/`PATCH /v1/users/:id` dependem só da credencial de serviço (ver acima).
- Sem troca/recuperação de senha e sem listar/encerrar outras sessões do cliente.
- O bloqueio de login é por CPF; não há limite por IP, porque todo tráfego chega pelo servidor do web. Um atacante pode bloquear temporariamente o login de um CPF conhecido (efeito colateral aceito do bloqueio por conta).
- Linhas antigas de `sessions` não são apagadas (só expiram); falhas de login antigas são limpas a cada falha nova.
- Redis e BullMQ só previstos; não há filas nem dependências instaladas.
- Resolução de banca consulta o banco a cada requisição (sem cache).
- Sem CORS configurado ou headers de segurança adicionais na API, pois ela não é exposta ao navegador nesta fase.
- Telefone só no formato nacional brasileiro; CPF só com validação de formato e dígitos verificadores.
