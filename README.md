# sys-jb

Estrutura inicial de um SaaS multi-banca (multi-tenant, white label): várias bancas com marca e domínio próprios no mesmo sistema. Esta etapa cobre **somente** infraestrutura mínima e cadastro, consulta e atualização de usuários com carteira zerada.

Fora do escopo desta etapa: apostas, resultados, sorteios, pagamentos, depósitos, saques, bônus, movimentação de carteira, integrações externas, login de clientes e CRUD de bancas.

## Estrutura

```text
apps/api             NestJS 12 (ESM): tenancy, users, carteira, login, painel administrativo (operadores), health
apps/web             Next.js 16 + Tailwind 4: app do cliente, painel administrativo (admin.<domínio>) e ferramentas de dev
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

# 6. (Opcional) Operador do painel administrativo (admin.localhost:3000), ver "Painel administrativo"
pnpm operator:create --tenant aurora --name "Gerente Aurora" --email gerente@aurora.test --role MANAGER

# 7. Em dois terminais
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
- `WEB_SERVICE_KEYS` (web, somente servidor): as mesmas chaves, indexadas pelo hostname. Inclui o hostname do painel com a `ADMIN_SERVICE_KEY` (`admin.localhost=<chave>`).
- `ADMIN_SERVICE_KEY` (API): credencial do painel administrativo único (mín. 32 caracteres, diferente das chaves das bancas). Vazia = painel desativado.
- `WEB_ADMIN_HOSTNAME` (web): hostname do painel (padrão `admin.localhost`; em produção, algo como `admin.seudominio.com.br`). É lido ao iniciar/compilar o web.

- `AUTH_SECRET` (API): chave HMAC do bloqueio de tentativas de login.

Nenhuma variável usa o prefixo `NEXT_PUBLIC_`.

Se você já tinha um `.env` de antes do login, acrescente só `AUTH_SECRET` (ex.: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`). Não rode `pnpm setup:env --force`: ele troca as senhas do banco, e o volume existente continuaria com as antigas.

## API

Todas as rotas `/v1/*` exigem `Authorization: Bearer <chave da banca>` e resolvem a banca pelo header `Host`.

| Método | Rota                                              | Comportamento                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/v1/users`                                       | Cria usuário e carteira zerada na mesma transação. `201` com o contrato público                                                                                                                                                                                                    |
| GET    | `/v1/users/:id`                                   | Consulta só dentro da banca atual                                                                                                                                                                                                                                                  |
| PATCH  | `/v1/users/:id`                                   | Atualiza apenas `name`, `email`, `phone`, `document`, `avatar`                                                                                                                                                                                                                     |
| POST   | `/v1/auth/login`                                  | Login por CPF + senha. `200` com `{ token, expiresAt, user }`                                                                                                                                                                                                                      |
| GET    | `/v1/me`                                          | Usuário da sessão (header `X-Session-Token`)                                                                                                                                                                                                                                       |
| POST   | `/v1/auth/logout`                                 | Revoga a sessão do `X-Session-Token`. `204`, idempotente                                                                                                                                                                                                                           |
| GET    | `/v1/me/profile`                                  | Perfil do usuário da sessão: contrato público + `birthDate` (só o dono recebe)                                                                                                                                                                                                     |
| PATCH  | `/v1/me`                                          | O usuário altera o PRÓPRIO `email` e `phone` (sessão). `409` se já cadastrados                                                                                                                                                                                                     |
| POST   | `/v1/me/password`                                 | Define a nova senha do usuário da sessão. `204`; encerra as OUTRAS sessões                                                                                                                                                                                                         |
| GET    | `/v1/tenant`                                      | Nome e cores da banca atual (usado pela interface)                                                                                                                                                                                                                                 |
| POST   | `/v1/fazendinha/bets`                             | Compra palpites da Fazendinha (sessão). `201` com o pule e a carteira debitada; ver "Fazendinha"                                                                                                                                                                                   |
| GET    | `/v1/fazendinha/sold?drawDate=AAAA-MM-DD`         | Números já vendidos no dia, por extração/modalidade/valor (sessão). Só números                                                                                                                                                                                                     |
| GET    | `/v1/draws`                                       | Sorteios ativos da banca e exceções de data da janela de apostas (sessão); ver "Sorteios"                                                                                                                                                                                          |
| GET    | `/v1/me/prizes?date=YYYY-MM-DD`                   | Pules premiadas do jogador da sessão no dia (hoje até 7 dias atrás; fora disso `400`). Sem apuração de resultados ainda: lista vazia                                                                                                                                               |
| GET    | `/v1/me/reports/balance?date=YYYY-MM-DD`          | Consultar saldo: movimento da carteira de apostas (saldo + prêmios + bônus) no dia (hoje até 7 dias atrás): vendas, comissão, prêmios, créditos/débitos (rótulo pelo tipo, nunca o motivo do painel), recargas, saques, saldo anterior e haver. Fecha com o livro de movimentações |
| GET    | `/v1/me/reports/lottery-movement?date=YYYY-MM-DD` | Movimento loterias: total apostado pelo jogador por extração do dia ("vale"), pelo código gravado na venda (hoje até 7 dias atrás)                                                                                                                                                 |
| GET    | `/v1/me/pules?date=YYYY-MM-DD`                    | Consultar pule por data: pules vendidas no dia (hoje até 6 dias atrás), mais recentes primeiro (até 200; `truncated` avisa), com os totais                                                                                                                                         |
| GET    | `/v1/me/pules/:puleNumber`                        | Recibo de uma pule do jogador (Loterias com `cancellable` ou Fazendinha). De outro jogador ou inexistente: `404` igual                                                                                                                                                             |
| GET    | `/v1/me/prizes/claim?pule=N`                      | Reclame: situação do prêmio de uma pule do jogador da sessão (`paid` com a data, ou `not_found`). Pule inexistente, de outro jogador ou sem prêmio respondem igual. Sem apuração ainda: sempre `not_found`                                                                         |
| GET    | `/health`                                         | `{"status":"ok","database":"up"}`, sem credencial e sem expor segredos                                                                                                                                                                                                             |

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

| No original                                    | Aqui                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bolsas `LOTERIAS`, `BONUS`, `GAMES`            | **Saldo** = `balanceJb + prizesJb`, **BÔNUS** = `bonusJb`, **Disp. Games** = `totalAvailableGames` (centavos)                                                                         |
| Modalidades ativas vindas da API               | Lista fixa com as 5 modalidades, sem banner (`lib/modalities.ts`)                                                                                                                     |
| Logo fixo `logo.svg`                           | Logo da banca (`logoUrl`) ou a inicial do nome                                                                                                                                        |
| `unitId` fixo                                  | `displayId` do usuário                                                                                                                                                                |
| Link de convite fixo e QR ilustrativo          | `<domínio da banca>/cadastro?convite=<código>` (código de convite de 5 caracteres, ex.: `CDYGE`) com QR real. O texto não promete recompensa: o crédito da indicação ainda não existe |
| Botões sem destino (tiles, abas, menu, rodapé) | Avisam "disponível em breve" (toast), em vez de não fazer nada                                                                                                                        |
| Próximo sorteio com contador fixo              | Contador real (`nextDraw`); sem sorteio cadastrado, o banner não aparece                                                                                                              |

O título da aba, o ícone (logo ou a inicial na cor da banca) e a cor da barra do navegador no celular vêm da banca. As ferramentas de desenvolvimento (consulta/edição por UUID) ficam em `/dev`, só em desenvolvimento.

Correções em relação ao original:

- **Barra superior** `sticky` em CSS: o conteúdo não fica escondido atrás dela antes do JavaScript carregar (o original media a altura com JS).
- **Menu e modal acessíveis**: `role="dialog"`, Esc fecha, o foco entra no painel e volta para quem abriu, a página por trás não rola, e fechados ficam `inert` (fora do Tab e dos leitores de tela).
- **Convite**: copiar/compartilhar tratam falhas (sem permissão, compartilhamento cancelado); o modal só é baixado quando aberto.
- **Saldo**: sessão expirada leva ao login; valores com separador de milhar (`1.234,56`).
- Safe areas do iPhone na barra inferior e no modal.

### Telas internas

Exigem sessão (sem ela, redirecionam para `/login`) e seguem o mesmo modelo do Dashboard: `app/<rota>/page.tsx` (servidor) → `views/` → `components/`. Layout a partir dos prints da pasta `PRINTS/`; cores e logo vêm da banca.

| Rota                               | Tela                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/resultados`                      | Lista de atalhos (`lib/section-menus.ts`)                                                                                                                                                                                 |
| `/relatorios`                      | Lista de atalhos (`lib/section-menus.ts`)                                                                                                                                                                                 |
| `/relatorios/saldo` e `/:data`     | Consultar saldo: escolha do dia (hoje e 7 anteriores) e o relatório, com "Compartilhar" (PDF)                                                                                                                             |
| `/relatorios/movimento` e `/:data` | Movimento loterias: escolha do dia (hoje e 7 anteriores) e o total por extração, com "Compartilhar" (PDF)                                                                                                                 |
| `/relatorios/pule`                 | Consultar pule: por código (`/codigo`, formulário GET) ou por data (`/data` → `/data/:data`, lista do dia)                                                                                                                |
| `/relatorios/pule/:numero`         | Recibo da pule (o mesmo da compra) com "Compartilhar" (PDF), "Cancelar pule" (só Loterias no horário de venda; o cancelamento ainda não existe: avisa "em breve") e "Menu". `?lista=YYYY-MM-DD` volta para a lista do dia |
| `/premiadas`                       | Lista de atalhos (`lib/section-menus.ts`)                                                                                                                                                                                 |
| `/premiadas/consultar`             | Consultar premiadas: escolha do dia (hoje e os 7 anteriores, Brasília)                                                                                                                                                    |
| `/premiadas/consultar/:data`       | Pules premiadas do jogador no dia (`YYYY-MM-DD`; fora do período volta à escolha do dia), por extração, com o total e "Compartilhar" (PDF). Sem apuração de resultados ainda: sempre "Nenhuma pule premiada"              |
| `/premiadas/reclame`               | Reclame: código da pule (formulário GET, funciona sem JavaScript) e, com `?pule=N`, o resultado ("Prêmio pago em dd/mm/aa" ou "Prêmio não encontrado") com "Compartilhar" (PDF)                                           |
| `/recarga-pix`                     | Recarga em duas etapas na mesma rota (a URL não muda): 1) valor (máscara de moeda, mín. R$ 1,00, teto de tela R$ 10.000,00) e destino; 2) pagamento: chave Pix (copia e cola), QR Code sob demanda e contagem de 5 min    |
| `/saques`                          | "Meus saques" (lista do usuário, vazia enquanto não há saques) e "Novo saque" na mesma rota, sem mudar a URL: 1) Pix, titular e chave; 2) resumo do saldo e valor                                                         |
| `/configuracoes`                   | Preferências (aposta rápida, notificações, possível prêmio), versão do app e "Baixar aplicativo"                                                                                                                          |
| `/perfil`                          | Perfil: nome e ID (copiar), telefone ("Alterar") e e-mail editáveis, CPF e nascimento só leitura, senha nova opcional                                                                                                     |

Os itens das listas ainda não têm página e avisam "disponível em breve". "Avançar" na recarga valida valor e destino e chama a server action `createPixChargeAction` (`app/recharge-actions.ts`), que exige sessão e revalida o pedido no servidor. Voltar da etapa 2 mantém o que foi digitado; expirado, "Gerar novo Pix" volta ao formulário. O menu lateral e a barra inferior do Dashboard já apontam para essas rotas (`lib/routes.ts`).

**Perfil**: salva de verdade, pela API, sempre na conta da sessão (as rotas `/v1/me*` não recebem id: exigem a credencial de serviço da banca **e** o `X-Session-Token` do cliente; sessão de outra banca, de operador, expirada ou de usuário bloqueado é `401`).

- **Só e-mail e telefone** mudam por aqui (corpo estrito: nome, CPF, nascimento, senha, status, banca e outros campos são recusados). Duplicidade na banca é `409` com o campo, sem revelar valores.
- **Senha**: a tela pede só "Nova senha" (como no design). A API aplica as regras do cadastro (tamanho, senha comum, não conter CPF, telefone ou nascimento), grava o hash argon2id e **encerra todas as outras sessões** do usuário; a atual continua. Na tela, a senha é conferida contra o telefone que ficará salvo. Se e-mail/telefone e senha são enviados juntos, o perfil é salvo primeiro; se a senha falhar, a tela avisa que os dados foram salvos e a senha não.
- **Data de nascimento** vem de `GET /v1/me/profile` (não faz parte do contrato público `PublicUser`).
- **Riscos aceitos** (decisão do produto): a troca de senha **não exige a senha atual**, então quem tem a sessão aberta consegue trocá-la (mitigado por encerrar as outras sessões, mas não impede quem já está na sessão); o telefone muda **sem verificação por SMS**; e não há trilha de auditoria para alterações feitas pelo próprio cliente (`audit_logs` é de operadores). Para endurecer: exigir `currentPassword` em `POST /v1/me/password` e confirmar telefone por código.

**Configurações**: as três preferências são aplicadas na hora e guardadas **só neste navegador** (`localStorage`), uma por usuário; ao ler, só vale valor booleano (dado adulterado volta ao padrão). Não há backend de preferências, então não sincronizam entre aparelhos.

- **Aposta rápida** e **Exibir possível prêmio** ainda não têm efeito: as telas de apostas e recibos não existem. Ficam guardadas para quando existirem (padrão: ligadas).
- **Permitir notificações** usa a permissão **real** do navegador: ligar abre o pedido; se for negado (ou já estiver bloqueado, ou o navegador não suportar) o interruptor fica desligado, desabilitado e com aviso. A preferência só aparece ligada se a permissão estiver concedida (se o usuário revogar depois, volta a aparecer desligada). Ainda **não há envio de notificações** (nem service worker/push).
- **Baixar aplicativo**: instala na tela inicial (PWA). O navegador avisa "pode instalar" uma única vez, por isso `InstallCapture` (no layout raiz) captura o aviso desde o carregamento; com ele, um toque abre a instalação; sem ele (iPhone, Firefox...), abre o passo a passo. Já instalado, o banner não aparece. O manifesto (`/manifest.webmanifest`) e os ícones PNG (`/pwa-icon/192` e `/512`: inicial da banca sobre a cor da banca) são gerados **por banca**, pelo hostname.
- **Versão**: vem de `apps/web/package.json` (hoje `0.0.0`), por `lib/app-version.ts`, e aparece em dois lugares: `V…` em Configurações e `v…` no rodapé do Dashboard. Para mudar o número, altere só esse arquivo.

**Saques (interface completa, sem envio)**: as telas dos prints estão prontas (lista com grupos por dia e detalhes, novo saque, "Confirmar saque" e "Solicitação enviada"), mas não existe solicitação de saque no backend. "Confirmar saque" chama a server action `requestWithdrawalAction` (`app/withdrawal-actions.ts`), que exige sessão e **revalida tudo no servidor** (tipo e formato da chave, CPF sempre o do titular da sessão, valor contra o saldo de agora), e então responde "Saque indisponível no momento". A tela "Solicitação enviada" só aparece quando o servidor devolve o saque criado, então nunca há um sucesso falso; a lista fica vazia. Nenhum saldo é alterado. As regras já estão prontas e testadas em `lib/withdrawal.ts` e `lib/pix-key.ts`, para o servidor reaproveitar quando existir:

- **Disponível para resgate** = saldo total − recarga − bônus (o "Entenda": bônus e recargas não podem ser resgatados), sobre o saldo das loterias; na carteira atual equivale aos prêmios (`prizesJb`). Games não entra.
- **Valor** entre R$ 1,00 (mínimo; suposição, os prints mostram um saque de R$ 8,00; ajuste `MIN_WITHDRAWAL_CENTS`) e o disponível.
- **Chave Pix**: CPF (sempre o do titular, somente leitura), e-mail (até 77 caracteres), celular (com DDD e nono dígito) ou aleatória (UUID). O saque só vale para conta com o mesmo CPF do cadastro.
- **Colar** (só na chave aleatória): lê a área de transferência; se o navegador negar ou estiver vazia, orienta a colar manualmente.
- **Chaves recentes** (até 5, com "Limpar"): guardadas **só neste navegador** (`localStorage`), uma lista por usuário, e registradas quando a chave é validada e o usuário avança para o valor. Ao ler, cada entrada é revalidada (dado adulterado é descartado). Não há histórico no servidor; quando existir a solicitação de saque, o registro deve passar para o saque concluído.
- **Para ligar o backend**: substituir o retorno "indisponível" da action pela chamada à API, com reserva atômica do saldo (sem saldo negativo) e chave de idempotência contra clique duplo. A lista (`items` de `WithdrawalsPage`) passa a vir da API; status previstos: Pendente, Pago, Recusado e Cancelado.

**Pix ainda sem provedor**: o backend não tem cobrança. `lib/pix-charge.ts` (`createPixCharge`) é o ponto de integração: em desenvolvimento devolve uma cobrança de teste (BR Code válido com chave inexistente, marcada na tela); em produção devolve `null` e a tela mostra "Pix indisponível no momento" e continua na etapa 1. Cada "Avançar" cria uma cobrança nova, até existir um provedor que guarde a cobrança.

### Organização do web

```text
app/                 rotas (Next App Router) e server actions (app/admin: painel administrativo)
views/               telas completas (LoginPage, RegisterPage, DashboardPage, SectionMenuPage, RechargePage)
views/admin/         telas do painel (AdminLoginPage, UsersPage, UserDetailPage)
components/auth/     AuthLayout, AuthInput, FormError
components/dashboard/ componentes do Dashboard, InviteProvider, TopBar
components/section/   SectionBar e MenuList (telas de atalhos)
components/recharge/  Recarga Pix: barra, valor, valores rápidos, destino, formulário
components/withdrawal/ Saques: lista, etapas (chave Pix e valor), resumo do saldo, "Entenda"
components/settings/ Configurações: interruptores, banner "Baixar aplicativo"
components/profile/  Perfil: identidade (nome e ID), formulário, painel "Nova senha"
components/pwa/       InstallCapture (captura o aviso de instalação do navegador)
components/admin/     painel: menu, filtro, tabela, paginação, edição, bloqueio, confirmação
components/tenant/   TenantProvider, TenantLogo (white label)
components/ui/       Toast, QrCode, Notice
components/dev/      ferramentas de /dev
hooks/               useAuth, useWallet, useOverlay, useCountdown
lib/                 cliente da API (server-only), sessão, máscaras, moeda, marca
lib/admin/           sessão do operador, chamadas à API do painel, resultado das actions, formatação
schemas/             validação dos formulários (regras de @sysjb/contracts)
```

## Painel administrativo

Há **um painel só**, em um endereço próprio: `http://admin.localhost:3000` (mesma aplicação web, host diferente). Não existe um painel por banca: o operador entra com e-mail e senha e **a banca é descoberta no login** (cada operador pertence a uma banca). Depois disso ele só enxerga e altera a **própria banca**: a banca vem da sessão do operador e do RLS, nunca do endereço, de campo do formulário ou de header enviado pelo navegador. O visual segue o admin do app original (`trv-clone/admin`); o código foi feito do zero.

No host do painel os caminhos são curtos (`/login`, `/usuarios`, `/usuarios/:id`); as páginas vivem em `app/admin` e o `next.config.ts` faz o mapeamento por host. `/admin/...` digitado direto, em qualquer host, responde `404`, e os apps das bancas (`aurora.localhost`…) não têm nenhuma rota do painel.

### Operadores e perfis

Cada banca pode ter vários operadores, cada um com um perfil. O **e-mail do operador é único no sistema todo** (é ele que diz a qual banca o operador pertence); quem operar duas bancas precisa de dois e-mails. As permissões ficam em `packages/contracts/src/admin.ts` (`ROLE_PERMISSIONS`), usadas pela API para autorizar e pelo web para decidir o que mostrar:

| Perfil     | Consultar usuários | Corrigir cadastro | Bloquear/reativar | Ver promotores | Gerenciar promotores |
| ---------- | :----------------: | :---------------: | :---------------: | :------------: | :------------------: |
| Gerente    |         ✔          |         ✔         |         ✔         |       ✔        |          ✔           |
| Suporte    |         ✔          |         ✔         |         ✘         |       ✘        |          ✘           |
| Financeiro |         ✔          |         ✘         |         ✘         |       ✔        |          ✘           |

Operadores **não têm cadastro pela API nem pela interface** (nesta etapa); são criados por script, com a credencial de migração:

```bash
pnpm operator:create --tenant aurora --name "Maria Souza" --email maria@banca.com --role MANAGER
# perfis: MANAGER, SUPPORT, FINANCE. Sem --password (ou OPERATOR_PASSWORD), gera uma senha forte e a mostra uma vez.
```

### Página de usuários

- **Lista** (`/usuarios`): busca por nome, CPF, telefone, e-mail ou ID exibido; filtro por status; paginação de 20 em 20. Tudo vive na URL (formulário `GET`, links de página), então funciona sem JavaScript, o botão voltar respeita o filtro e o link é compartilhável. CPF e telefone aparecem completos e formatados.
- **Detalhe** (`/usuarios/:id`): dados completos, data de nascimento, último acesso e carteira. Quem tem permissão edita nome, CPF, telefone e e-mail e bloqueia/reativa (com confirmação).
- **Bloquear** encerra as sessões abertas do usuário na hora e impede novo login. Só informa "conta bloqueada" depois de a senha conferir (não revela o bloqueio a quem não a conhece). `GET /v1/me` de um usuário bloqueado passa a responder `SESSION_INVALID`.

### Promotores

Promotor **não é um cadastro à parte**: é um jogador comum que ganhou uma **comissão** (em `users.promoter_commission_bps`, centésimos de %: 1 = 0,01%, 10000 = 100%, sempre inteiro). O Gerente promove um jogador existente de dois jeitos: na página **Promotores** (`/promotores`, botão "Novo promotor": busca o jogador, escolhe e define a %) ou na seção **Promotor** do detalhe do usuário. Na mesma página ele vê os promotores, a comissão e quantos jogadores cada um trouxe; clicando, vê os jogadores indicados, altera a comissão ou remove o promotor.

- **Vínculo pelo link de convite:** o link já existente (`/cadastro?convite=<ID exibido do promotor>`) agora vale de verdade. Quem se cadastra por ele fica vinculado ao promotor (`users.referred_by_user_id`). O vínculo só nasce no cadastro e **nunca muda** (a role de runtime não tem `UPDATE` nessa coluna). Código inexistente, de quem não é promotor, de promotor bloqueado ou de outra banca é ignorado: o cadastro segue sem vínculo (e sem revelar nada). Só o formato inválido é `400`. Um trigger no banco confere de novo que o indicador é um promotor ativo da mesma banca; a FK composta impede vínculo entre bancas e um CHECK impede auto-indicação.
- **Remover promotor:** os jogadores já vinculados continuam vinculados (histórico), mas ninguém novo entra pelo link.
- **Comissão a pagar:** a comissão incide sobre as apostas dos jogadores indicados. **O projeto ainda não tem apostas**, então o painel guarda o percentual e mostra os indicados, mas não calcula ganhos. Quando as apostas existirem, o cálculo entra sobre essa base.
- **Auditoria:** `promoter.enable`, `promoter.update` e `promoter.disable`, com a comissão antes/depois (`from`/`to`). Repetir o mesmo valor não gera registro.
- Os campos `promoter`, `promoterName` e `promoterPhone` da resposta pública do jogador seguem `null` (o jogador não vê quem o indicou).

### Rotas da API do painel

Todas exigem a credencial do painel (`ADMIN_SERVICE_KEY`, no `Authorization: Bearer`; as credenciais das bancas **não** abrem estas rotas, nem esta abre as das bancas) **e**, exceto login e logout, a sessão do operador (header `X-Operator-Token`) com a permissão do perfil (`401` sem sessão, `403` sem permissão). A banca da requisição é a do operador da sessão; o `Host` não conta. Respostas com `Cache-Control: no-store`.

| Método | Rota                                | Permissão          | Comportamento                                                                      |
| ------ | ----------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| POST   | `/v1/admin/auth/login`              | (sem sessão)       | E-mail + senha. `200` com `{ token, expiresAt, operator }`. Sessão de 8 h          |
| GET    | `/v1/admin/me`                      | sessão             | `{ operator, tenant }`: o operador, suas permissões e a identidade visual da banca |
| POST   | `/v1/admin/auth/logout`             | (sem sessão)       | Revoga a sessão. `204`, idempotente                                                |
| GET    | `/v1/admin/users`                   | `users.read`       | `?page&pageSize(≤100)&search&status`. Itens com CPF e telefone (só dígitos)        |
| GET    | `/v1/admin/users/:id`               | `users.read`       | Detalhe com dados completos e carteira                                             |
| PATCH  | `/v1/admin/users/:id`               | `users.update`     | Só `name`, `email`, `phone`, `document`. `409` se CPF/telefone/e-mail já existem   |
| PATCH  | `/v1/admin/users/:id/status`        | `users.status`     | `{ "status": "ACTIVE" \| "BLOCKED" }`. Repetir o status é aceito sem efeito        |
| GET    | `/v1/admin/promoters`               | `promoters.read`   | `?page&pageSize(≤100)&search`. Comissão e quantidade de jogadores indicados        |
| GET    | `/v1/admin/promoters/:id`           | `promoters.read`   | Um promotor (`404` se o usuário não é promotor)                                    |
| GET    | `/v1/admin/promoters/:id/referrals` | `promoters.read`   | Jogadores indicados (paginado)                                                     |
| PUT    | `/v1/admin/promoters/:id`           | `promoters.manage` | `{ "commissionBps": 1..10000 }`. Promove ou altera a comissão                      |
| DELETE | `/v1/admin/promoters/:id`           | `promoters.manage` | Remove a condição de promotor. `204`, idempotente                                  |

### Segurança do painel

- **Sessão do operador**: token opaco de 256 bits; só o SHA-256 vai para o banco (`operator_sessions`). O web guarda o token num cookie `HttpOnly`, sem `Domain` (preso ao host do painel: os apps das bancas nem o recebem; em produção, com prefixo `__Host-` e `Secure`); o navegador nunca lê o token. A sessão de cliente e a de operador **não são intercambiáveis** (headers e tabelas separados).
- **Login**: e-mail inexistente, operador inativo, banca inativa e senha errada têm a mesma resposta e o mesmo custo (a resposta nunca revela se o e-mail existe nem de qual banca é); 5 falhas por e-mail em 15 min bloqueiam (`429`), contadas em tabela própria (`operator_login_failures`, só o HMAC do e-mail, sem banca), separada do login de cliente. Desativar um operador (`active = false`) derruba as sessões dele na hora.
- **Autorização na API**, não na tela: esconder um botão é só conveniência. Cada rota confere a sessão e a permissão a cada chamada; as páginas do web também conferem a sessão (layouts não rodam a cada navegação).
- **Banco**: `operators`, `operator_sessions` e `audit_logs` têm RLS por banca. Como o login e a leitura da sessão acontecem **antes** de a banca ser conhecida, duas policies extras liberam só `SELECT` de **uma linha**, escolhida por um valor que a transação informa (`app.login_email` em `operators`; `app.session_hash`, o hash do token, em `operator_sessions`); sem esse valor nada extra fica visível, e escrita continua exigindo o contexto da banca. Depois de achar a sessão, a mesma transação entra na banca dela e só então lê o operador. A role de runtime **não cria nem altera operadores** e **não altera nem apaga a auditoria** (somente inclusão); só ganhou `UPDATE` na coluna `users.status`. Um trigger garante que todo usuário nasce `ACTIVE`.
- **Auditoria** (`audit_logs`): toda edição e todo bloqueio/reativação registra quem fez, em quem e quando, **na mesma transação** da alteração. Guarda só nomes de campos, nunca valores pessoais.
- **Busca**: `%`, `_` e `\` do texto digitado são escapados (o Prisma não escapa curingas de `LIKE`).
- **Dados pessoais**: a lista e o detalhe mostram CPF e telefone completos (decisão do produto: o operador identifica o usuário sem abrir cada um). Como a lista expõe esses dados em lote, o acesso ao painel deve ser restrito (rede, 2FA). Nenhuma resposta traz hash de senha.

## Fazendinha

Tela em `/fazendinha` (uma rota só; as etapas lista → palpites → comprovante trocam pelo estado da tela). Modalidades (grupo, dezena, centena) e valores de aposta ficam em `packages/contracts/src/fazendinha.ts`, usados pela tela e pela API; as extrações são os sorteios da banca marcados para a Fazendinha (ver "Sorteios").

- **Compra** (`POST /v1/fazendinha/bets`): a API confere extração, valor, faixa dos palpites e horário (a venda fecha no **"Venda até"** do sorteio; até 6 dias à frente, em Brasília). O banco confere tudo de novo num trigger (`fazendinha_bets_draw_open` → `draw_for_sale`), então nem um bug na API aceita aposta de extração fechada, desativada ou fora do dia. Grava o pule e os números e chama `fazendinha_debit` **na mesma transação**. Cada palpite custa o valor da aposta; o total sai primeiro do saldo e depois dos prêmios (bônus não é usado).
- **Cada número é vendido uma vez** por extração + modalidade + valor (UNIQUE no banco). Número já vendido: `409 NUMBERS_UNAVAILABLE` com os números em `details`; saldo insuficiente: `409 INSUFFICIENT_FUNDS`; extração encerrada: `409 DRAW_CLOSED`.
- **Idempotência**: o web manda uma `idempotencyKey` por seleção. Reenviar a mesma chave devolve o mesmo pule sem cobrar de novo; a mesma chave com outra aposta é `409 CONFLICT`.
- **Travas no banco**: a role de runtime continua sem `UPDATE` em `wallets`. `fazendinha_debit` (`SECURITY DEFINER`, sujeita ao RLS) só debita o total de um pule da banca corrente, uma vez, conferindo total = valor × números; um trigger adiado recusa o commit de pule sem débito; depois do débito o pule não aceita números novos; pule, números e movimentações são somente inclusão.
- **Comprovante**: `VENDEDOR` é o `displayId` do próprio jogador; `COTAÇÃO` mostra o multiplicador da modalidade.
- **Limitações**: não há apuração de resultado nem pagamento de prêmio, nem histórico de pules do jogador.

## Loterias

Tela em `/loterias` (uma rota só, como a Fazendinha), com 9 etapas: Nova aposta → Data → Modalidade → Colocação → Palpites → Valor → Loterias → Carrinho → Finalizar, e o recibo. Só o **Tradicional** está disponível; os outros tipos avisam "em breve". "Repetir pule" tem fluxo próprio (abaixo). Regras em `packages/contracts/src/lotteries.ts`, usadas pela tela e pela API.

- **Modalidades**: as da tabela de cotações (Grupo, Dezena, Centena, Milhar, Unidade, Duque/Terno Dez, Terno Dez Seco, Duque/Terno/Quadra GP, Quina 8/5, Sena 10/6, Passe Vai/Vem) e as derivadas pela cotação da base: Centena/Milhar Invertida (valor dividido pelas permutações), Centena Esquerda/Inv Esq, Dezena Esq/Meio e Milhar e Centena (metade em cada). Modalidade com cotação 0 não aparece. Ficaram de fora "Palpitão" e "Centena 3X" (regra não definida).
- **Colocação**: números aceitam 1º, 1/5, 1 e 1/5, 2º–5º, 1/2, 1/3, 1/4 (prêmio ÷ posições); combos têm colocação fixa (a cotação já considera).
- **Valor**: "Todos" divide entre os palpites; "Cada" vale por palpite. Várias loterias = um pule por extração, com os mesmos itens.
- **Compra** (`POST /v1/lotteries/tickets`): valida sorteios (cadastro da banca), palpites, horário limite (o banco confere de novo e grava o "Venda até" do cadastro no pule) e a **cotação que o jogador viu** (`QUOTE_CHANGED` se mudou). Grava os pules e debita cada um (`lottery_debit`, movimentação `LOTTERY_BET`) na mesma transação; mesma chave não compra de novo. Entra no cálculo das comissões (valor apostado).
- **Limitações**: sem apuração de resultado nem pagamento de prêmio; o botão "Valendo" do carrinho não foi feito.

### Repetir pule

Na primeira tela das Loterias, "Repetir pule" abre um fluxo próprio na mesma rota (`RepeatPuleFlow`, layout de `PRINTS/Repetir Pule/`): **modalidade** (só o Tradicional; os outros tipos avisam "em breve") → **data** (hoje e os próximos 6 dias) → **loterias** (a mesma lista da compra, com favoritas) → **código da pule** (resumo do que foi escolhido; só dígitos, "Colar" pega os dígitos da área de transferência) → "Pule repetida com sucesso! Direcionando ao recibo…" → **recibo** (Compartilhar e Menu). Falha: "Não foi possível repetir" com o motivo e "Tentar novamente".

- **API** (`POST /v1/lotteries/tickets/repeat`, sessão): `{ idempotencyKey, puleNumber, drawDate, draws }`. As apostas (modalidade, colocação, palpites, valor e divisão) vêm da pule; a compra passa pela **mesma venda** das Loterias (sorteios do cadastro, horário, saldo, débito na mesma transação e idempotência) e usa a **cotação de agora**. Responde como a compra.
- **Segurança**: só pule de Loterias do **próprio jogador**. O número é sequencial e as apostas não são públicas, então pule inexistente, de outro jogador, de outra banca ou da Fazendinha têm a mesma resposta (`404 NOT_FOUND`, "Pule inválida"), sem revelar nada e sem cobrar. Modalidade que foi desligada na cotação: `409` ("Esta pule tem uma modalidade que não está mais disponível.").
- **Idempotência**: a tela gera uma chave por pedido (pule + data + loterias). "Tentar novamente" reusa a chave (nunca compra duas vezes); mudar o código, a data ou as loterias gera outra.
- Testes: `lottery-repeat.test.ts` (API) e `RepeatPuleFlow.test.tsx` (web).

## Sorteios

Cadastro **por banca**, em **Sorteios** no painel (Gerente edita; Financeiro consulta; Suporte não vê). É **uma lista só** para Loterias e Fazendinha: cada sorteio diz para quais jogos vale. Banca nova já nasce com o cadastro padrão (72 sorteios: RIO/FEDERAL, MALUQUINHA, NACIONAL, LOOK/GOIAS, SAO-PAULO, LOTECE/LOTEP, BAHIA, CAPITAL, MINAS GERAIS; Federal e Maluq Federal às **quartas e domingos**). O horário do sorteio padrão é a hora cheia do nome, ou 2 minutos depois do "Venda até" quando ele passa da hora cheia: confira e ajuste no painel.

- **Campos**: grupo, nome (no pule, único na banca), **código** (relatórios do jogador, ex.: `PTRIO14`; letras e dígitos, até 12, único na banca), horário do sorteio, **venda até** (≤ horário do sorteio), dias da semana, jogos, situação (ativo/inativo) e ordem na lista. O pule guarda nome + hora do sorteio e o **código da venda** (`draw_code`, gravado pelo trigger de venda a partir do cadastro; mudar o código depois não altera pules já vendidas).
- **Código vazio** = gerado pelo banco (`draw_default_code`): o nome sem "LT " e sem a hora, só letras e dígitos (até 10), mais a hora do nome (ou a do sorteio). "LT PT RIO 14HS" → `PTRIO14`; "LT FEDERAL" → `FEDERAL20`. Os sorteios existentes e o cadastro padrão de banca nova usam esse código; ajuste no painel.
- **Exceções de data**: "Sem sorteio" de um sorteio ou do **dia todo** (feriado) e "Sorteio extra" (corre num dia fora da semana dele). De hoje até um ano.
- **Apostas vendidas travam o cadastro** (`409 DRAW_HAS_BETS`, SQLSTATE `SJ005`, conferido por trigger no banco): com aposta de hoje em diante, o sorteio não pode ser desativado, perder o jogo ou o dia da aposta, nem ganhar exceção que o cancele; com qualquer aposta já vendida, não pode ser renomeado, mudar de hora nem ser excluído. Horário de venda, grupo e ordem podem mudar. O estorno de apostas de sorteio cancelado fica para a apuração de resultados.
- **Concorrência**: a venda trava a linha do sorteio (`FOR SHARE`) e a alteração do cadastro espera a compra terminar (e vice-versa), então a trava vê sempre a compra concorrente.
- **Auditoria**: "Sorteio cadastrado/alterado/excluído" (com os campos alterados) e "Exceção de data criada/removida".

| Método | Rota                             | Permissão      | Comportamento                                                               |
| ------ | -------------------------------- | -------------- | --------------------------------------------------------------------------- |
| GET    | `/v1/admin/draws`                | `draws.read`   | Todos os sorteios (ativos e inativos) e as exceções de hoje em diante       |
| POST   | `/v1/admin/draws`                | `draws.manage` | Cadastra. `409 CONFLICT` se o nome ou o código já existe                    |
| PUT    | `/v1/admin/draws/:id`            | `draws.manage` | Altera (cadastro completo). `409 DRAW_HAS_BETS` quando a trava acima impede |
| DELETE | `/v1/admin/draws/:id`            | `draws.manage` | Exclui (só sem nenhuma aposta vendida)                                      |
| POST   | `/v1/admin/draws/exceptions`     | `draws.manage` | `{ date, drawId \| null, kind: "CANCEL" \| "EXTRA", note? }`                |
| DELETE | `/v1/admin/draws/exceptions/:id` | `draws.manage` | Remove a exceção (recusado se deixaria apostas de um extra sem sorteio)     |

## Personalização

Grupo do menu do painel com **Identidade visual**, **Cards do início** e **Mural**. Só o Gerente vê e altera (`branding.read`/`branding.manage`, `murals.read`/`murals.manage`).

### Identidade visual

O Gerente altera, com pré-visualização (aba do navegador, login e início): **nome da banca** (2 a 40), **logo** (PNG, JPG ou WebP até 1 MB, conferido pelo conteúdo; SVG não, porque pode conter script), **cor principal** (`#RRGGBB`) e a **barra "Indique um amigo"**: liga/desliga e texto (até 60). Ligada, aparece no topo de todas as telas do jogador (início, telas internas, Loterias e Recarga Pix); desligada, em nenhuma. Vale na hora: a API lê a banca a cada requisição.

- **Logo**: guardada no banco (`tenant_logos`, com RLS) e servida pelo web em `/marca/logo?v=<versão>`, no app da banca (pública, aparece no login) e no painel. Sem logo enviada vale a logo padrão da banca (`tenants.logo_url`); sem nenhuma, a inicial do nome. "Remover a logo enviada" volta à padrão.
- **Cor secundária**: existe no cadastro, mas nenhuma tela a usa ainda; por isso a página não a oferece.
- **WhatsApp do suporte** (opcional, mesmo formato do telefone do jogador): usado pelos botões de atendimento (ver abaixo).

### Atendimento (WhatsApp)

"Atendimento" (início), "Suporte" (rodapé e menu lateral) e "Fale com o suporte" (login e cadastro) abrem o WhatsApp (`https://api.whatsapp.com/send?phone=+55<número>&text=<mensagem>`). A mensagem é montada pela API (`supportMessage` em `@sysjb/contracts`):

- para o promotor: "Olá Promotor <nome do promotor>, preciso de ajuda, meu código de unidade é: <código>."
- para a banca: "Olá, preciso de ajuda, meu código de unidade é: <código>."
- no login/cadastro (sem sessão, sem código): "Olá, preciso de ajuda."

O código de unidade é o `displayId` do jogador. Quem fala:

- **Jogador com promotor vinculado** (quem o indicou é promotor ativo): o telefone do **promotor**. Indicado por jogador comum, por promotor removido ou bloqueado: vale o da banca.
- **Sem promotor** (e no login/cadastro, sem sessão): o **WhatsApp do suporte da banca**, definido em Personalização > Identidade visual. Sem número configurado, a tela avisa "Atendimento indisponível no momento".
- `GET /v1/me/support` (sessão) devolve `{ phone, message }`, escolhidos pela API a partir da sessão: o jogador só recebe o número e o nome do **próprio** promotor (o nome vai na mensagem), e ninguém consegue os dados de outro promotor. O número da banca também sai em `GET /v1/tenant` (`supportPhone`), porque aparece antes do login.
- A aba é aberta já no toque e recebe o endereço depois da consulta (aberta só depois, o navegador a bloquearia como pop-up), sem acesso de volta ao app (`opener = null`).
- Testes: `support.test.ts` (API) e `SupportBanner.test.tsx` (web).
- **Banco**: `tenants` ganhou RLS só para alteração (`tenants_update_own`: só a banca do contexto; a leitura continua livre, porque a banca é resolvida pelo hostname antes do contexto). A role de runtime só pode alterar `name`, `primary_color`, `secondary_color`, `invite_bar_text` e `logo_updated_at`; slug, domínio, logo padrão e situação continuam fora do alcance dela.
- **Seed**: `pnpm db:seed` não sobrescreve mais nome e cores de bancas existentes (só na criação).
- **Auditoria**: "Identidade visual alterada", com os campos alterados.

| Método | Rota                      | Permissão / credencial | Comportamento                                                                       |
| ------ | ------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/v1/admin/branding`      | `branding.read`        | Nome, cores, texto da barra, logo em uso e se há logo enviada                       |
| PUT    | `/v1/admin/branding`      | `branding.manage`      | `{ name, primaryColor, secondaryColor, inviteBarText, logo? }`; `logo: null` remove |
| GET    | `/v1/admin/branding/logo` | sessão do operador     | Logo enviada (binário)                                                              |
| GET    | `/v1/tenant/logo`         | credencial da banca    | Logo enviada (binário). Sem logo enviada: `404`                                     |

`branding.test.ts` (API) e `BrandingEditor.test.tsx` (web) cobrem leitura, alteração com auditoria, remoção da logo, validação, permissões, isolamento entre bancas e as travas do banco.

### Cards do início

O Gerente define a **ordem dos blocos** do início do app (Próximo sorteio, Loterias e Fazendinha, Atalhos, Cassino, Raspadinha e Bingo, Atendimento), a **ordem dos cards dentro de cada bloco** e o que **aparece** (interruptor por bloco e por card), com pré-visualização. Arrastar pela alça ou ↑/↓ (teclado e toque). Os cards nunca mudam de bloco.

- **Guardado** em `tenant_settings.home_layout` (JSON, com RLS). Sem nada salvo vale a ordem do app original. A API só aceita o layout completo (todos os blocos, cada um com exatamente os seus cards); ao ler, `normalizeHomeLayout` (`@sysjb/contracts`) descarta o que saiu do catálogo e acrescenta no fim, visível, o que entrou depois.
- **No app**: bloco oculto ou sem nenhum card visível não aparece; nos atalhos, os que sobram ocupam a linha; em Loterias/Fazendinha e Raspadinha/Bingo, um card sozinho ocupa a largura toda. Sem resposta da API, o início abre na ordem padrão.
- **Auditoria**: "Cards do início alterados", com o que mudou ("Ordem dos blocos", "Ordem em Atalhos", "Sonhos oculto"…).

| Método | Rota                      | Permissão / credencial | Comportamento                          |
| ------ | ------------------------- | ---------------------- | -------------------------------------- |
| GET    | `/v1/admin/branding/home` | `branding.read`        | Layout atual (sempre completo)         |
| PUT    | `/v1/admin/branding/home` | `branding.manage`      | `{ blocks: [{ id, visible, cards }] }` |
| GET    | `/v1/tenant/home-layout`  | credencial da banca    | Layout para o app do jogador           |

`home-layout.test.ts` (API), `HomeLayoutEditor.test.tsx` e `home-cards.test.tsx` (web).

## Mural

Aviso com imagem que aparece para o jogador logado ao abrir o app (folha inferior do Dashboard, com "Fechar", layout de `PRINTS/Mural.png`). Cadastrado **por banca** em **Personalização > Mural** no painel (só o Gerente: `murals.read`/`murals.manage`), com pré-visualização de como o jogador vê.

- **Campos**: nome (até 60), vigência (data inicial e final, dias inteiros de Brasília, inclusivos), tipo de exibição e imagem (PNG, JPG ou WebP até **3 MB**; o formato é conferido pelo conteúdo do arquivo, na API e por CHECK no banco). Na alteração, sem imagem nova a atual continua; a data final no passado só é recusada quando é alterada.
- **Apenas uma vez**: cada jogador vê uma vez só, em qualquer aparelho. Fica registrado no servidor (`mural_views`) assim que o mural aparece. A coluna "Já viram" do painel mostra quantos.
- **Sempre**: aparece a cada abertura do app. Depois de fechado não volta nas idas e vindas ao Dashboard na mesma aba (fica no `sessionStorage`, apagado quando a aba fecha).
- **Mais de um no ar**: o jogador vê um depois do outro, do mais recente (data inicial) para o mais antigo, até 10.
- **Imagem**: guardada no banco (`bytea`) e servida pelo web em `/mural/:id/imagem?v=<versão>` (jogador, só murais no ar) e no painel na mesma rota do host do painel. A versão muda a cada alteração, então o navegador não mostra imagem antiga.
- **Upload**: a server action do painel aceita até 4 MB (`experimental.serverActions.bodySizeLimit` no `next.config.ts`, que vale para todas as actions); a API aceita corpo JSON de até 5 MB (a imagem vai em base64) só em `POST`/`PUT /v1/admin/murals` (o resto continua com 16 KB).
- **Auditoria**: "Mural cadastrado/alterado/excluído", com o nome do mural e os campos alterados. Excluir apaga também o registro de quem viu.

| Método | Rota                         | Permissão / sessão | Comportamento                                                        |
| ------ | ---------------------------- | ------------------ | -------------------------------------------------------------------- |
| GET    | `/v1/admin/murals`           | `murals.read`      | Todos os murais da banca (sem a imagem), com "já viram"              |
| GET    | `/v1/admin/murals/:id/image` | `murals.read`      | A imagem (binário)                                                   |
| POST   | `/v1/admin/murals`           | `murals.manage`    | `{ name, startsOn, endsOn, displayMode: "ONCE" \| "ALWAYS", image }` |
| PUT    | `/v1/admin/murals/:id`       | `murals.manage`    | Mesmo corpo; `image` opcional                                        |
| DELETE | `/v1/admin/murals/:id`       | `murals.manage`    | Exclui o mural e o registro de quem viu                              |
| GET    | `/v1/murals`                 | sessão do jogador  | Murais no ar que o jogador deve ver agora, na ordem                  |
| GET    | `/v1/murals/:id/image`       | sessão do jogador  | Imagem de mural no ar (agendado ou encerrado: `404`)                 |
| POST   | `/v1/murals/:id/seen`        | sessão do jogador  | Registra que viu ("Apenas uma vez"). `204`, idempotente              |

`murals.test.ts` (API) cobre cadastro, alteração e exclusão com auditoria, validação (imagem ausente, formato, tamanho, datas, campos extras), permissões, isolamento entre bancas, a lista do jogador (vigência, "Apenas uma vez" × "Sempre", idempotência) e os privilégios do banco. No web, `MuralSheet.test.tsx` e `MuralsManager.test.tsx`.

## Cotações

Tabela de prêmios por banca, editada pelo Gerente em **Cotações** no painel (Financeiro só consulta; auditoria "Cotações alteradas"). Sem nada salvo valem os padrões de `packages/contracts/src/quotes.ts` (tabela de referência **800/1/8000**). Prêmio **R$ 0,00 desliga** a opção.

- **Tradicional**: prêmio para cada R$ 1,00 por modalidade (Unidade, Grupo, Dezena, Centena, Milhar, Duque/Terno/Quadra GP, Quina 8/5, Sena 10/6, Duque Dez, Terno Dez Seco, Terno Dez, Palpitão, Passe Vai, Passe Vai Vem). O nome da tabela (`centena/1/milhar`) aparece nos recibos como "COTAÇÃO".
- **Fazendinha**: prêmio de cada número por modalidade e valor de aposta (R$ 1 a R$ 100). A tela só oferece os valores com prêmio, e a compra usa a cotação da banca naquele momento: o prêmio fica gravado no pule (`fazendinha_bets.prize_cents`), então mudar a tabela depois não altera pules vendidos.
- **Jogador**: Relatórios > Cotações mostra as tabelas (Tradicional e Fazendinha; os outros jogos ainda "em breve"), com Compartilhar.

## Indicação e comissões

Promotor ≠ Indicação. Todo jogador tem no máximo um "indicado por": o dono do link de convite (`?convite=CDYGE`) usado no cadastro, jogador comum ou promotor (usuário ativo da banca; código desconhecido ou de usuário bloqueado é ignorado). O vínculo nunca muda.

- **Código de convite**: 5 caracteres de um alfabeto sem ambíguos (sem O/0/I/1), gerado pelo banco no cadastro, **único no sistema todo** (índice UNIQUE; em colisão o cadastro tenta de novo) e fixo (a API não altera). Aceito em maiúsculas ou minúsculas. Links antigos com o ID exibido (`?convite=100008`) continuam valendo. O painel mostra o código no detalhe do usuário e busca por ele.
- **Indique e ganhe (X%)**: igual para a banca toda, definido pelo Gerente em **Comissões** no painel (`tenant_settings`, com auditoria). 0% desliga.
- **Promotor (Y%)**: a comissão de cada promotor. Se quem indicou é promotor no fechamento, recebe **X% + Y%** (ex.: 3% + 7% = 10%).
- **Base**: o valor apostado pelos indicados no mês (Brasília, pela data da aposta). Ganho arredondado para baixo no centavo.
- **Fechamento mensal**: o Gerente vê a prévia e clica em "Fechar mês" (só meses encerrados; uma vez por mês). A função `commission_close_month` grava o fechamento e cada pagamento e **credita o Saldo** na mesma transação (movimentação `COMMISSION`). Quem indicou e está **bloqueado** não recebe (fica como "não recebeu"). Mês fechado fica congelado: mudar percentuais depois não altera o que foi pago.
- **Perfis**: Gerente altera o X% e fecha; Financeiro só consulta; Suporte não vê. O banco confere de novo que quem fecha é Gerente ativo.
- **Painel**: lista de usuários com as colunas "Indicado por" e "Promotor"; no detalhe, "Indicado por" e "Promotor do jogador" separados.

## Contrato monetário

- **Todo valor monetário é um inteiro em centavos** (`1050` = R$ 10,50). No banco são `bigint`, com CHECK de não negatividade e de soma ≤ `Number.MAX_SAFE_INTEGER`.
- `totalAvailableJb = balanceJb + bonusJb + prizesJb` e `totalAvailableGames = balanceGames + bonusGames + prizesGames`, calculados na leitura e não persistidos.
- `withdrawable` é sempre `0`: não existe regra de saque nesta fase.
- Os totais são só uma convenção de apresentação e **não** definem elegibilidade para apostas ou saques.
- Não há endpoint de alteração de saldo e a role de runtime não tem `UPDATE` em `wallets`; um trigger exige saldo zero na criação.
- **Saldo conciliado**: toda mudança de `balance_jb`, `prizes_jb` e `bonus_jb` precisa de uma movimentação em `wallet_entries` (somente inclusão, inclusive para a dona das tabelas). Ao fim de cada transação o banco confere saldo = soma das movimentações e recusa o commit se não bater. As bolsas de games não mudam (ainda não há movimentação delas).
- Tipos de movimentação: `FAZENDINHA_BET` (débito da compra, pela função `fazendinha_debit`), `MANUAL_ADJUSTMENT` (crédito/estorno com motivo) e `OPENING_BALANCE` (saldos que existiam antes do registro, criados pela migration).
- **Crédito/estorno manual** só pelo script, com a credencial de migração: `pnpm wallet:adjust --tenant trevo --user 100008 --amount 1000 --note "motivo"` (estorno: `--amount=-50,25`; `--bucket prizes|bonus` para outras bolsas). Carteira negativa é recusada.
- `promoter`, `promoterName` e `promoterPhone` são sempre `null`. Estão centralizados no contrato (`PublicPromoterFields`) e no mapper (`promoterFields()`) para evolução futura.
- Campos nullable sempre aparecem como `null`, nunca são omitidos. O objeto público não inclui `tenantId` nem timestamps.

## Isolamento entre bancas

1. **Resolução por hostname**: allowlist exata contra `tenants.domain`, com minúsculas, sem ponto final e sem porta. Hostname desconhecido ou banca inativa retorna `404`, sem fallback. `tenantId` em body é rejeitado; em query ou header é ignorado.
2. **X-Forwarded-Host** só é considerado com `API_TRUST_PROXY` apontando para um proxy explícito (ex.: `loopback`). O padrão é `false`, e `true` é recusado.
3. **Serviço/repositório**: toda consulta a `users`/`wallets` passa por `DatabaseService.withTenant` e filtra `tenantId` explicitamente.
4. **RLS no PostgreSQL** (segunda camada): `ENABLE` + `FORCE ROW LEVEL SECURITY` em `users`, `wallets`, `sessions`, `login_failures`, `operators`, `operator_sessions` e `audit_logs`, com políticas `USING` e `WITH CHECK` em `tenant_id = app_current_tenant_id()`. O contexto é definido com `set_config('app.tenant_id', <uuid>, true)`, local à transação e na mesma conexão das consultas. Ao fim da transação o valor é descartado, então não vaza pelo pool. Sem contexto, nenhuma linha é visível e nenhuma escrita passa.
5. **FKs compostas**: `wallets(tenant_id, user_id)` e `sessions(tenant_id, user_id) → users(tenant_id, id)` (e, no painel, `operator_sessions` e `audit_logs → operators`) impedem carteira, sessão ou auditoria de uma banca apontar para usuário ou operador de outra.

### Roles do PostgreSQL

| Role             | Uso                                                           | Atributos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`       | Só o init do container                                        | superuser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sysjb_migrator` | Migrations, seed e setup dos testes (`DATABASE_MIGRATOR_URL`) | dona do schema e das tabelas; `CREATEDB` para o shadow DB do `prisma migrate dev`; sem superuser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `sysjb_app`      | Runtime da API (`DATABASE_URL`)                               | `NOSUPERUSER`, `NOBYPASSRLS`, não é dona de nada. `SELECT` em `tenants`; `SELECT`/`INSERT`/`UPDATE` (só colunas editáveis; `password_hash` também no UPDATE, para a troca de senha; nascimento só no INSERT) em `users`; `SELECT`/`INSERT` em `wallets`; `SELECT`/`INSERT` e `UPDATE` só de `revoked_at` em `sessions`; `SELECT`/`INSERT`/`DELETE` em `login_failures`; `SELECT` em `operators`; `SELECT`/`INSERT` e `UPDATE` só de `revoked_at` em `operator_sessions`; `SELECT`/`INSERT` (somente inclusão) em `audit_logs`; `UPDATE` também de `users.status`; `SELECT`/`INSERT` (somente inclusão) em `fazendinha_bets` e `fazendinha_bet_numbers`; `SELECT` em `wallet_entries`; `EXECUTE` em `fazendinha_debit`; sem `DELETE` nas demais; não pode escolher `id` nem `displayId` |

`displayId` vem de uma sequence do PostgreSQL (começa em 100000). Aceita lacunas e é `int4`, portanto sempre um inteiro seguro em JSON.

## Limite de requisições

Todas as rotas `/v1` passam por um limite de requisições na API (`RateLimitInterceptor`). Estourou: `429 TOO_MANY_ATTEMPTS` com `Retry-After`, e a tela mostra "Muitas requisições/tentativas. Aguarde um pouco…". Toda tentativa conta, inclusive as recusadas.

| Regra (`.env`)              | Sujeito           | Padrão            | Vale para                                                      |
| --------------------------- | ----------------- | ----------------- | -------------------------------------------------------------- |
| `RATE_LIMIT_LOGIN_IP`       | IP                | 20/min e 100/hora | Login do jogador e do painel (além do bloqueio por CPF/e-mail) |
| `RATE_LIMIT_SIGNUP_IP`      | IP                | 10/hora e 30/dia  | Cadastro de jogador                                            |
| `RATE_LIMIT_REQUESTS_IP`    | IP                | 600/min           | Qualquer rota (rajadas)                                        |
| `RATE_LIMIT_USER_WRITE`     | jogador da sessão | 30/min            | Compras, Repetir pule, perfil, senha… (tudo que grava)         |
| `RATE_LIMIT_USER_READ`      | jogador da sessão | 180/min           | Consultas                                                      |
| `RATE_LIMIT_OPERATOR_WRITE` | operador          | 60/min            | Alterações do painel (cadastros, uploads, edição…)             |
| `RATE_LIMIT_OPERATOR_READ`  | operador          | 300/min           | Consultas do painel                                            |

- **Formato**: `limite/segundos`, várias janelas separadas por vírgula (ex.: `RATE_LIMIT_LOGIN_IP=20/60,100/3600`). Valor inválido impede a API de subir. `RATE_LIMIT_ENABLED=false` desliga tudo (não use em produção).
- **Contagem no PostgreSQL** (`rate_limit_counters`, janelas fixas alinhadas ao relógio do banco): vale para todas as instâncias da API, sem Redis. Uma ida ao banco por requisição conta todas as regras; contadores vencidos são apagados pela própria API (no máximo uma vez por minuto por instância).
- **IP do visitante**: a API só é chamada pelo servidor do web, que repassa o IP no cabeçalho `X-Client-IP` (a API só aceita um IP válido, e só em rotas que já passaram pela credencial de serviço). O web lê o IP do `X-Forwarded-For` contando **a partir do fim** o número de proxies confiáveis (`WEB_TRUSTED_PROXY_HOPS`, padrão 1 = um nginx na frente): o que o visitante mandar à esquerda é ignorado, então não dá para forjar outro IP. Sem IP confiável, valem só os limites por sessão.
- **LGPD**: o IP nunca é gravado em texto, só o HMAC dele (`AUTH_SECRET`), como o CPF no bloqueio de login. Jogador e operador entram pelo id (UUID).
- **Produção**: o nginx precisa acrescentar o IP real (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Com CDN + nginx, use `WEB_TRUSTED_PROXY_HOPS=2`.
- Testes: `rate-limit.test.ts` (API: login e cadastro por IP, jogador e operador, ação recusada não executada, IP inválido ignorado, IP só como HMAC, health fora, configuração) e `client-ip.test.ts` (web: proxies, IP forjado ignorado, IPv6 e porta). Nas demais suítes da API o limite fica desligado.

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

`fazendinha.test.ts` cobre a compra: pule + débito na mesma transação (saldo antes dos prêmios, bônus intocado), saldo insuficiente sem gravar nada, número já vendido (inclusive compras simultâneas: só uma leva), idempotência (reenvio e cliques simultâneos com a mesma chave = um pule e um débito), catálogo e janela de datas, números vendidos por banca, e as travas do banco (sem `UPDATE` em carteira, sem pule sem débito, sem débito duplo, total conferido, pule imutável).

`draws.test.ts` cobre o cadastro de sorteios: leitura do jogador (padrão, Federal quarta/domingo), permissões, validação, auditoria, as travas de apostas vendidas (desativar, tirar jogo/dia, renomear, excluir, feriado, remover extra), exceções na venda (API e banco), isolamento entre bancas e a concorrência compra × alteração nos dois sentidos.

`admin.test.ts` cobre o painel: login de operador (resposta única, bloqueio, cada operador na sua banca pelo mesmo endereço, e-mail único no sistema, banca inativa, credencial do painel × das bancas, painel desativado sem `ADMIN_SERVICE_KEY`), sessão (expirada, desativado, cliente × operador), perfis e permissões (matriz completa), lista (máscara, paginação estável, busca sem curingas, filtro), detalhe, edição com auditoria, bloqueio (sessões revogadas, login, `/v1/me`) e privilégios do banco (auditoria somente inclusão, operadores só leitura, usuário só nasce `ACTIVE`, leitura por chave antes de haver banca). `config.test.ts` cobre a validação da `ADMIN_SERVICE_KEY`.

`apps/web` tem testes de componentes (Vitest + Testing Library + jsdom) para máscaras, moeda, schemas, login e cadastro, menu lateral (inert, Esc, foco), convite (QR, cópia com falha, compartilhamento cancelado), saldo (oculto, erro, sessão expirada), contador do sorteio e o painel administrativo (lista, filtros e paginação na URL, detalhe por perfil, edição com erros por campo, bloqueio com confirmação, login e menu).

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

- `GET`/`PATCH /v1/users/:id` (integração) ainda dependem só da credencial de serviço (ver acima). O painel usa rotas próprias (`/v1/admin/*`), com sessão e perfil de operador.
- Painel: só a página de usuários existe. Não há cadastro/edição de operadores pela interface (só o script `operator:create`), troca ou recuperação de senha de operador, nem tela para consultar a auditoria (os registros ficam em `audit_logs`).
- A busca de usuários usa `ILIKE` sem índice de trigrama: adequada para milhares de usuários por banca; com centenas de milhares, criar índice `pg_trgm`.
- Troca de senha só logado (sem exigir a senha atual, ver "Perfil"); sem recuperação de senha ("esqueci") e sem listar/encerrar sessões avulsas do cliente.
- O bloqueio de 5 falhas é por CPF (ou e-mail do operador): um atacante pode bloquear temporariamente o login de um CPF conhecido (efeito colateral aceito do bloqueio por conta). O limite por IP (ver "Limite de requisições") depende de o proxy na frente do web preencher o X-Forwarded-For corretamente; redes móveis com IP compartilhado dividem o mesmo limite por IP (por isso os limites por IP são generosos e os limites finos são por sessão).
- Linhas antigas de `sessions` não são apagadas (só expiram); falhas de login antigas são limpas a cada falha nova.
- Redis e BullMQ só previstos; não há filas nem dependências instaladas.
- Resolução de banca consulta o banco a cada requisição (sem cache).
- Sem CORS configurado ou headers de segurança adicionais na API, pois ela não é exposta ao navegador nesta fase.
- Telefone só no formato nacional brasileiro; CPF só com validação de formato e dígitos verificadores.
