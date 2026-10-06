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
| GET    | `/v1/me/prizes?date=YYYY-MM-DD`                   | Pules premiadas do jogador da sessão pela data do jogo (hoje até 7 dias atrás; fora disso `400`), com os itens e palpites premiados. Só depois de pagas (ver "Apuração de prêmios")                                                                                                |
| GET    | `/v1/me/reports/balance?date=YYYY-MM-DD`          | Consultar saldo: movimento da carteira de apostas (saldo + prêmios + bônus) no dia (hoje até 7 dias atrás): vendas, comissão, prêmios, créditos/débitos (rótulo pelo tipo, nunca o motivo do painel), recargas, saques, saldo anterior e haver. Fecha com o livro de movimentações |
| GET    | `/v1/me/reports/lottery-movement?date=YYYY-MM-DD` | Movimento loterias: total apostado pelo jogador por extração do dia ("vale"), pelo código gravado na venda (hoje até 7 dias atrás)                                                                                                                                                 |
| GET    | `/v1/me/pules?date=YYYY-MM-DD`                    | Consultar pule por data: pules vendidas no dia (hoje até 6 dias atrás), mais recentes primeiro (até 200; `truncated` avisa), com os totais                                                                                                                                         |
| GET    | `/v1/me/pules/:puleNumber`                        | Recibo de uma pule do jogador (Loterias com `cancellable` ou Fazendinha). De outro jogador ou inexistente: `404` igual                                                                                                                                                             |
| GET    | `/v1/me/prizes/claim?pule=N`                      | Reclame: situação do prêmio de uma pule do jogador da sessão (`paid` com o dia da apuração, ou `not_found`). Pule inexistente, de outro jogador, ainda não apurada ou sem prêmio respondem igual                                                                                   |
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
| `/premiadas/consultar/:data`       | Pules premiadas do jogador no dia do jogo (`YYYY-MM-DD`; fora do período volta à escolha do dia), por extração, com os palpites premiados, o total e "Compartilhar" (PDF)                                                 |
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

**Saques**: lista "Meus saques" (grupos por dia, detalhes com o que cada situação significa, motivo da recusa e "Cancelar saque" enquanto em análise), novo saque, "Confirmar saque" e "Solicitação enviada" (ver a seção "Saques"). A server action `requestWithdrawalAction` (`app/withdrawal-actions.ts`) exige sessão, revalida a chave (CPF sempre o do titular da sessão) e o valor contra o sacável de agora, e chama a API, que confere tudo de novo e reserva o valor. A tela "Solicitação enviada" só aparece quando a API devolve o saque criado.

- **Disponível para resgate** = prêmios das loterias + ganhos do cassino (`PublicWallet.withdrawable`). Recarga e bônus nunca são sacáveis ("Entenda").
- **Valor** entre o mínimo e o máximo por saque da banca e o disponível; "Valor máximo" para no menor dos dois. Pausado ou com o limite de saques do dia atingido, a tela avisa e nada é enviado.
- **Chave Pix**: CPF (sempre o do titular, somente leitura), e-mail (até 77 caracteres), celular (com DDD e nono dígito) ou aleatória (UUID). O saque só vale para conta com o mesmo CPF do cadastro.
- **Clique duplo**: cada confirmação aberta gera uma chave de idempotência; tentar de novo no mesmo diálogo (rede caiu) repete a chave e devolve o mesmo saque.
- **Colar** (só na chave aleatória): lê a área de transferência; se o navegador negar ou estiver vazia, orienta a colar manualmente.
- **Chaves recentes** (até 5, com "Limpar"): guardadas **só neste navegador** (`localStorage`), uma lista por usuário. Ao ler, cada entrada é revalidada (dado adulterado é descartado).

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

O **Gerente** cadastra os operadores da própria banca em **Administração > Operadores** (`/operadores`, permissão `operators.manage`, só o Gerente):

- **Cadastrar**: nome, e-mail (o login; único em todas as bancas) e perfil. A senha é **gerada pelo sistema** (24 caracteres) e mostrada **uma única vez**, para o Gerente entregar ao operador; o banco guarda só o hash argon2id.
- **Alterar** nome, e-mail e perfil (o perfil novo vale na próxima chamada do operador). **Desativar** derruba as sessões abertas na hora e impede o login; **ativar** devolve o acesso com a mesma senha. **Gerar nova senha** invalida a antiga e encerra as sessões.
- O Gerente **não muda o próprio perfil, não se desativa e não gera a própria senha** por aqui, então a banca nunca fica sem Gerente ativo.
- **Banco**: a role de runtime continua sem INSERT/UPDATE em `operators`; tudo passa pelas funções `operator_create`, `operator_update`, `operator_set_active` e `operator_set_password` (`SECURITY DEFINER`, sujeitas ao RLS), que conferem de novo que quem age é um Gerente ativo da banca e a regra acima (`SJ009` → 409). E-mail repetido: 409 no campo.
- **Auditoria**: `operator.create`, `operator.update` (campos alterados), `operator.activate`, `operator.deactivate` e `operator.password`, com o operador afetado (nunca a senha).
- Rotas (`operators.manage`): `GET`/`POST /v1/admin/operators`, `PUT /v1/admin/operators/:id`, `PATCH /v1/admin/operators/:id/status` e `POST /v1/admin/operators/:id/password`. Testes: `operators.test.ts` (API) e `OperatorsManager.test.tsx` (web).

O **primeiro Gerente** de uma banca nova continua sendo criado por script, com a credencial de migração:

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
- **Prêmio**: vale só o 1º prêmio (a cabeça), pelo prêmio gravado na compra; a apuração paga sozinha (ver "Apuração de prêmios").

## Loterias

Tela em `/loterias` (uma rota só, como a Fazendinha), com 9 etapas: Nova aposta → Data → Modalidade → Colocação → Palpites → Valor → Loterias → Carrinho → Finalizar, e o recibo. Disponíveis: **Tradicional** (1/7) e **Tradicional 1/10**; os outros tipos avisam "em breve". "Repetir pule" tem fluxo próprio (abaixo). Regras em `packages/contracts/src/lotteries.ts`, usadas pela tela e pela API.

- **Modalidades**: as da tabela de cotações (Grupo, Dezena, Centena, Milhar, Unidade, Duque/Terno Dez, Terno Dez Seco, Duque/Terno/Quadra GP, Quina 8/5, Sena 10/6, Passe Vai/Vem) e as derivadas pela cotação da base: Centena/Milhar Invertida (valor dividido pelas permutações), Centena Esquerda/Inv Esq, Dezena Esq/Meio e Milhar e Centena (metade em cada). Modalidade com cotação 0 não aparece. Ficaram de fora "Palpitão" e "Centena 3X" (regra não definida).
- **Colocação** (`LOTTERY_GAME_PLACEMENTS`): na 1/7, 1º a 6º, 1/5, 1 e 1/5 e as faixas até o 6º (1/2 … 5/6); na 1/10, 1º a 10º, 1/5, 1/10, 1 e 1/5 e as faixas até o 10º (sem 6/9). Faixa = prêmio ÷ posições. Combos têm colocação fixa (a cotação já considera), igual nos dois jogos.
- **Tradicional 1/10**: mesmas modalidades e a **mesma tabela de cotação** da 1/7; mudam as colocações e as loterias: só os sorteios marcados como "Loterias 1/10" no cadastro (Sorteios no painel; no padrão, BAHIA e LOTECE/LOTEP, que valem nos dois jogos). O pule grava o jogo (`lottery_tickets.game`), mostrado no recibo, em Consultar pule e no PDF. O banco confere de novo: sorteio do jogo (`draw_for_sale`), colocação do jogo (trigger com `lottery_placement_allowed`, mesma lista do contrato, conferida por teste) e a trava de apostas vendidas por jogo (tirar a 1/10 de um sorteio com pule 1/10 vendido: `DRAW_HAS_BETS`). Sem `game` no pedido, vale a 1/7.
- **Valor**: "Todos" divide entre os palpites; "Cada" vale por palpite. Várias loterias = um pule por extração, com os mesmos itens.
- **Compra** (`POST /v1/lotteries/tickets`): valida sorteios (cadastro da banca), palpites, horário limite (o banco confere de novo e grava o "Venda até" do cadastro no pule) e a **cotação que o jogador viu** (`QUOTE_CHANGED` se mudou). Grava os pules e debita cada um (`lottery_debit`, movimentação `LOTTERY_BET`) na mesma transação; mesma chave não compra de novo. Entra no cálculo das comissões (valor apostado).
- **Prêmios**: pagos pela apuração (ver "Apuração de prêmios"). **MILHAR E CENTENA** grava também a cotação da centena (`centena_quote_cents`), porque quem acerta só a centena recebe pela metade dela. **Sena GP 10/6** vale do 1º ao 6º prêmio e **Passe Vai / Vai e Vem** um grupo no 1º e o outro do 2º ao 5º (colocações fixas 1/6 e 1/5, como no "Como jogar"; pules antigos gravados com 1/5 e 1/2 são apurados pela regra atual).
- **Limitações**: o botão "Valendo" do carrinho não foi feito.

### Repetir pule

Na primeira tela das Loterias, "Repetir pule" abre um fluxo próprio na mesma rota (`RepeatPuleFlow`, layout de `PRINTS/Repetir Pule/`): **jogo** (Tradicional 1/7 ou 1/10; os outros tipos avisam "em breve"; a pule só se repete no jogo dela, senão a API diz qual é) → **data** (hoje e os próximos 6 dias) → **loterias** (a mesma lista da compra, com favoritas) → **código da pule** (resumo do que foi escolhido; só dígitos, "Colar" pega os dígitos da área de transferência) → "Pule repetida com sucesso! Direcionando ao recibo…" → **recibo** (Compartilhar e Menu). Falha: "Não foi possível repetir" com o motivo e "Tentar novamente".

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

## Resultados

Resultados das loterias vindos do provedor **Loteria Integrada**. São **globais** (o resultado de uma extração é o mesmo para todas as bancas) e ficam em `lottery_results`: um por **data (Brasília) + sigla + extração** (hora, 0–23). O jogador vê em **Resultados > Resultado loterias** (hoje e os 7 dias anteriores) o número, o grupo e o bicho de cada prêmio das extrações que escolher (ver vínculo abaixo). O catálogo de siglas e nomes fica em `@sysjb/contracts` (`RESULT_LOTTERIES`); sigla fora dele é aceita e aparece em maiúsculas.

**Webhook (entrada principal).** O provedor faz `POST` a cada resultado e reenvia até receber `200`/`201`.

- **URL a cadastrar no provedor**: `https://<hostname do web>/integracoes/resultados` (ex.: `https://admin.seudominio.com.br/integracoes/resultados`; vale em qualquer hostname do web, inclusive o do painel). A API não é exposta à internet: o web repassa o corpo (até 16 KB) e os cabeçalhos do token para `POST /v1/integrations/results` e devolve a resposta dela. O web não guarda segredo da integração.
- **Token**: `RESULTS_WEBHOOK_TOKEN` (24 a 32 caracteres; o provedor aceita até 32), cadastrado **igual** no painel do provedor. `pnpm setup:env` gera um de 32. O provedor manda o token em `X-Auth-Token`, `Token` e `Authorization: Bearer`: todos os que vierem precisam conferir (comparação em tempo constante). Vazio = webhook desativado (`401`).
- **Validação** (`422` com os nomes dos campos, nunca os valores): data real e não futura, sigla de 2 a 4 letras, extração 00–23, de 5 a 10 prêmios com 4 dígitos (5 na Federal). `"0"` marca prêmio não usado e só vale no fim; `"0000"` é número válido. Prêmio enviado como número JSON é recusado (perderia o zero à esquerda). `res_resultado` precisa bater com os prêmios um a um. O grupo é calculado pelo milhar (o `res_grupos` do provedor não é usado); `res_api_chave` e `res_servidor` não são guardados.
- **Idempotência e correções**: reenvio igual responde `200` sem alterar nada (inclusive entregas simultâneas: uma instrução `INSERT ... ON CONFLICT`). Resultado diferente do gravado é uma **correção**: vira nova revisão (`revision`) e a versão anterior vai para `lottery_result_revisions` (trigger `SECURITY DEFINER`; somente inclusão), com aviso no log. Uma lista de prêmios que é o começo da gravada (ex.: 5 prêmios depois de 7) e campo calculado vazio **não** apagam o que já existe.
- **Banco**: CHECKs repetem as regras de formato; revisão e datas são do banco (trigger), nunca da API. A role de runtime lê, inclui e corrige o conteúdo; não exclui, não muda data/sigla/extração nem grava o histórico.

**Consulta (recuperação).** A API de consulta do provedor (`RESULTS_API_URL`, `RESULTS_API_TOKEN` fornecido por ele) consome a **cota mensal** do contrato, então é usada só sob demanda, para recuperar o que o webhook não entregou:

```bash
pnpm results:fetch --lottery rj                                  # hoje, o que já saiu e falta
pnpm results:fetch --lottery rj --date 2026-09-30 --extraction 21
pnpm results:fetch --lottery all --date 2026-09-30               # todas as siglas do catálogo
pnpm results:fetch --lottery rj --date 2026-09-30 --force        # consulta mesmo completo (conferir correção)
```

**Proteção da cota** (`results-recovery.ts`), antes de cada consulta:

1. **Já gravado não é consultado.** O catálogo diz quais extrações cada sigla tem; só consulta se faltar alguma. Sem `--extraction`, consulta o dia inteiro: **uma** requisição traz todas as extrações.
2. **Extração que ainda não saiu não é consultada** (hoje: só 30 minutos depois da hora da extração).
3. **Consulta respondida há menos de `RESULTS_API_COOLDOWN_MINUTES`** (padrão 10), com resultado ou "nenhum resultado", não se repete para a mesma data e sigla. Falha de rede não ativa a espera.
4. **Cota mensal.** Cada consulta fica em `result_consultations` (somente inclusão; data/hora do banco), com as respostas HTTP recebidas, novas tentativas incluídas: é o que o provedor cobra. As consultas param ao chegar em `RESULTS_API_QUOTA_STOP_PERCENT` (padrão 90) de `RESULTS_API_MONTHLY_QUOTA` (mês de Brasília), e as novas tentativas nunca passam do limite. Sem cota informada, só conta e mostra o uso. `401` (token inválido ou cota do provedor esgotada) interrompe as siglas seguintes.

`--force` ignora 1 a 3 (a cota continua valendo). Duas execuções simultâneas podem passar juntas pela conferência da cota (no máximo uma consulta a mais cada).

Mesmas regras do webhook (normalização, idempotência, correção com histórico). Só grava itens da data/sigla/extração pedidas. Cliente só HTTPS, sem seguir redirecionamento (o token não vaza para outro host), com tempo limite, resposta de até 1 MB e até 2 novas tentativas em falha de rede/5xx. Usa a credencial de runtime (`DATABASE_URL`).

**Vínculo com os sorteios da banca.** Cada sorteio tem o resultado do provedor que vale para ele (`draws.result_lottery` + `draws.result_extraction`, editável em Painel > Sorteios > "Resultado (provedor)"; só combinações do catálogo). A extração é o número que o **provedor** dá ao sorteio, que nem sempre é a hora do sorteio: a "LT FEDERAL" sorteia às 20h e usa a extração 19 do provedor (`fd` 19). O cadastro padrão já vem ligado onde a correspondência é certa (63 de 72; Lotep 09h/20h = `pb` 09/20, a "PT Paraíba" do provedor; Nacional 21h = `ln` 20; Lotece 10h/14h/16h/19h = `lce` 11/14/15/19; Alvorada 12h = `mg` 12 e Minas Pref 21h = `mg` 21, confirmados pela operação); ficam sem ligação os que o provedor não tem (Capital, Maluquinha Federal). Sem ligação, o sorteio aparece na escolha mas nunca tem resultado.

**Tela do jogador** (Resultados > Resultado loterias), numa rota só, `/resultados/loterias` (como Loterias e Fazendinha: o endereço não muda entre as etapas, e o voltar de cada uma leva à anterior): data (hoje e 7 dias antes) → escolha das extrações do dia (a mesma lista agrupada da compra, com favoritas) → comprovante com número, grupo e bicho de cada prêmio das escolhidas que já têm resultado (nenhuma: "Não há resultado na data"), com Compartilhar em PDF. O resultado do dia vem da server action `loadResultsAction`. A notificação "Resultado saiu" abre `/resultados/loterias?data=&sorteios=` (`resultsViewPath`), que mostra direto o resultado e deixa o endereço só como `/resultados/loterias`; os endereços antigos (`/resultados/loterias/:data` e `/:data/resultado`) redirecionam para ela.

**Venda depois do resultado**: o banco recusa a venda (`409 DRAW_CLOSED`) de um sorteio cujo resultado ligado, na data, já chegou, mesmo com o horário de venda mal configurado. Os pules são apurados por esses resultados (ver "Apuração de prêmios").

| Método | Rota                            | Acesso                                  | Comportamento                                                                                       |
| ------ | ------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/integracoes/resultados` (web) | token do provedor                       | Repassa à API. `502` se a API não responder (o provedor reenvia)                                    |
| POST   | `/v1/integrations/results`      | token do provedor (sem banca)           | `201 {codigo, mensagem}` novo; `200` repetido ou corrigido; `401` token; `422` inválido; `400` JSON |
| GET    | `/v1/results?date=YYYY-MM-DD`   | credencial da banca + sessão do jogador | Resultados do dia (hoje até 7 dias atrás; fora disso `400`), na ordem do catálogo                   |

## Apuração de prêmios

A API confere os pules (Loterias e Fazendinha) contra o resultado do sorteio ligado a cada um (`draws.result_lottery` + `result_extraction`, na data do pule) e paga os premiados na **bolsa de prêmios** (`prizes_jb`), sozinha, numa rodada a cada minuto (`PrizeSettlementService`). Regras em `packages/contracts/src/settlement.ts`, com os prêmios do resultado como o jogador vê (`resultFullPrizes`: nas loterias de 7 prêmios, o 6º é a soma e o 7º a multiplicação).

- **Carência** (`PRIZES_GRACE_MINUTES`, padrão 30): o resultado precisa ficar esse tempo **sem correção** do provedor antes de pagar. Correção dentro da carência recomeça a contagem, e vale a versão corrigida. Correção **depois** do pagamento não muda o que foi pago: o pule é conferido com a revisão nova (`checked_*`) e, se o prêmio seria outro, vira aviso em **Operação > Prêmios** para o operador ajustar a carteira.
- **Conta** (a mesma do "Possível prêmio" do recibo, em inteiros): cada acerto paga valor do palpite × cotação ÷ R$ 1,00 × fração da colocação ÷ permutações (invertidas), arredondado para baixo no centavo. Faixa = prêmio ÷ posições; "1 e 1/5" = 3/5 no 1º prêmio e 1/10 do 2º ao 5º; o mesmo palpite que sai em duas posições da colocação ganha duas vezes. "Todos" divide o valor entre os palpites.
- **Modalidades** (texto "Como jogar"): milhar, centena, dezena e unidade pelos dígitos da direita (Federal: os 4 últimos dos 5); esquerda e meio pelos dígitos da milhar; grupo pela dezena da direita (00 = 25); invertidas em qualquer ordem; MILHAR E CENTENA paga as duas metades se acertar a milhar, ou só a metade da centena. Combos ganham uma vez por palpite, pela cotação da modalidade: duque/terno/quadra de grupo e duque/terno de dezena com todos os números do 1º ao 5º; terno de dezena seco do 1º ao 3º; quina 8/5 com 5 grupos diferentes do 1º ao 5º; sena 10/6 com 6 grupos do 1º ao 6º; passe vai com um grupo no 1º e o outro do 2º ao 5º (vai e vem: em qualquer ordem). Fazendinha: só o 1º prêmio, pelo prêmio gravado na compra.
- **Pendentes**: pule que precisa de uma posição que o resultado ainda não tem (ex.: o 6º prêmio sem a soma) espera a próxima versão do resultado. Pule de sorteio **sem resultado ligado** nunca é apurado: aparece em "Aguardando apuração" no painel. A rodada olha os últimos 31 dias.
- **Banco**: cada pule é apurado numa transação própria pelas funções `lottery_settle` / `fazendinha_settle` (`SECURITY DEFINER`, sujeitas ao RLS), que conferem de novo: o resultado é o do sorteio da venda, na data e na revisão atual (`SJ007` se mudou); o pule não foi cancelado nem vendido depois de o resultado chegar (`SJ008`); o prêmio de Loterias não passa do "possível prêmio" de cada item × palpites premiados × posições, com palpites do próprio pule; o da Fazendinha é exatamente o calculado pelo 1º prêmio. Gravam, uma vez só (rodadas simultâneas de várias instâncias não pagam duas vezes): `pule_settlements` (todo pule apurado, premiado ou não), `pule_prizes` (premiados, com os itens) e a movimentação **`PRIZE`** na carteira. A role de runtime só lê essas tabelas; nem a dona altera ou apaga apuração ou prêmio (triggers).
- **Venda**: o banco recusa vender um sorteio cujo resultado da data já chegou (`409 DRAW_CLOSED`).
- **Jogador**: Premiadas (por data do jogo, com os palpites premiados), Reclame ("Prêmio pago em" = dia da apuração), Consultar saldo ("Prêmios", por pule) e a notificação "Pule premiada" no app instalado.
- Testes: `settlement-rules.test.ts` (regras de cada modalidade e colocação, e o acerto na melhor posição = possível prêmio do recibo) e `prize-settlement.test.ts` (carência, pagamento único inclusive com rodadas simultâneas, correções antes e depois do pagamento, pendentes, isolamento entre bancas, telas e as travas do banco).

## Cassino

Jogos do provedor **PlayFivers** (`playfiver.json`). O saldo do cassino é o **Disponível Games** da carteira.

- **Telas**: `/cassino` (lobby: saldo, Recarga Pix, busca por jogo ou provedor, filtros Todos/Favoritos/provedor, Top ganhos e uma faixa por provedor com "Ver todos") e `/cassino/jogo/<id>` (jogo em tela cheia com "Sair"). Favoritos ficam no aparelho (por jogador). Atalhos no banner, menu lateral e rodapé do início.
- **Catálogo**: a API busca `GET /api/v2/games` ao subir e a cada 12 h e guarda em `casino_games` (global). Com `PLAYFIVERS_WALLETS` (ex.: `Carteira Oficial (Slots)`), entram só os provedores dessas carteiras, conforme `GET /api/v2/providers` (cada provedor pertence a uma carteira, e a aposta consome o crédito dela). Nome de carteira que não existe não muda nada, e o log lista as carteiras disponíveis. Item fora do formato é descartado; jogo que sai do provedor é desativado (nunca apagado). Catálogo vazio ou falha do provedor não muda nada.
- **Abrir jogo**: `POST /v1/casino/games/:id/launch` chama `game_launch` com o jogador no formato `<ID> <primeiro nome> - <banca>` (ex.: `10000 Carlos - Trevo da Sorte`, sem acento nem símbolo; legível no painel do PlayFivers) e o saldo gastável. O webhook identifica o jogador **só pelo ID do início** (único em todas as bancas): mudar o nome ou a banca não desvia dinheiro. Cada conta tem o seu ID, então a mesma pessoa em duas bancas é dois jogadores no provedor (RTP e histórico separados); o RTP do agente vale para todas as bancas. O endereço devolvido só é aceito em `https`. A tela do jogo tem CSP própria (`frame-src https:` só nessa rota) e o iframe é isolado (`sandbox` sem navegação da página).
- **Webhook**: `https://<domínio>/integracoes/cassino?token=<CASINO_WEBHOOK_TOKEN>` (o web repassa à API com o token no cabeçalho, sem o IP do provedor). `BALANCE` devolve o saldo; `WinBet` aplica a rodada em `casino_apply_transaction` (carteira travada, **uma vez só por `txn_id`**: repetição devolve o saldo atual; mesmo `txn_id` com outro valor é recusado). Confere o segredo do agente (`PLAYFIVERS_SECRET_KEY`, tempo constante) e, se configurado, `PLAYFIVERS_AGENT_CODE`. Respostas no formato do provedor (`INSUFFICIENT_USER_FUNDS`, `INVALID_USER`, `ERROR_INTERNAL`).
- **Origem do webhook**: `CASINO_WEBHOOK_IPS` (IPs ou faixas CIDR do PlayFivers): fora da lista = `403` no web, antes de chegar à API (a API não é exposta, o web é a única porta). Vazio = aceita e registra no log do web o IP de cada chamada; use isso para descobrir os IPs do provedor (a documentação dele não informa) e preencha. Entrada inválida ou IP indeterminado (proxy mal configurado, ver `WEB_TRUSTED_PROXY_HOPS`) = recusa. **Em produção, preencha sempre.**
- **Token no endereço**: o PlayFivers só chama a URL cadastrada, então o token vai na query (`?token=`). O web e a API nunca registram a URL nem o corpo (a API recebe o token num cabeçalho). Quem pode registrar é o proxy na frente. No nginx, use um log sem a query string nessa rota:

  ```nginx
  log_format sem_query '$remote_addr - [$time_local] "$request_method $uri" $status $body_bytes_sent';
  location = /integracoes/cassino {
      access_log /var/log/nginx/access.log sem_query;
      proxy_pass http://127.0.0.1:3000;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  ```

  Com Cloudflare na frente, não exporte a query dessa rota em Logpush/Log Explorer (ou use uma regra de transformação que remova `token` antes de registrar). Se o token vazar, troque `CASINO_WEBHOOK_TOKEN` e a URL no painel do PlayFivers; com a lista de IPs, o token sozinho já não basta.

- **Dinheiro**: a aposta sai do saldo de games e depois dos prêmios de games; o prêmio entra nos prêmios de games (inclusive de jogador bloqueado; bloqueado não aposta). O bônus de games continua sem movimentação, por isso o saldo informado ao provedor é saldo + prêmios de games. Cada rodada com movimento gera um lançamento `CASINO` (coluna Games do extrato no painel); a conciliação da carteira inclui os prêmios de games. `casino_transactions` é só inclusão, com RLS por banca.
- **Top ganhos**: maiores prêmios da banca nas últimas 24 h, com o nome mascarado (`Gustavo***27`).
- Configuração: `PLAYFIVERS_API_URL`, `PLAYFIVERS_AGENT_TOKEN`, `PLAYFIVERS_SECRET_KEY`, `PLAYFIVERS_AGENT_CODE`, `PLAYFIVERS_WALLETS`, `CASINO_WEBHOOK_TOKEN`, `CASINO_WEBHOOK_IPS` (ver `.env.example`). Sem credenciais o cassino fica desligado. Libere o IP do servidor no PlayFivers.
- Testes: `apps/api/test/casino.test.ts` (catálogo, lobby, busca, abertura, webhook, idempotência, saldo insuficiente, bloqueio, isolamento) e, no web, `components/casino/casino.test.tsx`, `lib/casino-webhook.test.ts`, `lib/casino-favorites.test.ts`.

## Pagamentos (Recarga Pix)

Recarga via Pix pelo **gateway ativo da banca**, escolhido pelo Gerente no painel. Hoje há um gateway, a **MisticPay** ([documentação](https://docs.misticpay.com/)); novos gateways implementam `PaymentGatewayAdapter` (`apps/api/src/payments/gateway-adapter.ts`: criar cobrança, consultar, testar) e entram em `PAYMENT_GATEWAYS` (contracts) e no CHECK da migration.

- **Painel** (Configurações > Pagamentos, `/configuracoes/pagamentos`): `payments.read` (Gerente e Financeiro) consulta; `payments.manage` (só o Gerente) grava Client ID/Secret, faz o "Testar conexão" e ativa/desativa. **Um gateway ativo por banca**; sem nenhum, a recarga fica indisponível. Credenciais: só vão do painel para a API. A API cifra (AES-256-GCM, chave derivada de `PAYMENTS_SECRET_KEY`, amarrada à banca e ao gateway) e o banco guarda só o texto cifrado. O painel recebe apenas uma pista (`pk_…ab12`), e a auditoria registra só o gateway (`payment.gateway.update/activate/deactivate`). Gravar e ativar passam pelas funções `payment_gateway_save`/`payment_gateway_set_active`, que conferem **de novo no banco** que quem age é Gerente ativo da banca.
- **MisticPay**: chave de acesso `pk_`/`sk_` (API → Chaves de Acesso) com os escopos **TRANSACTION_CREATE** e **TRANSACTION_READ** (BALANCE_READ é opcional: o teste mostra o saldo). Valores em reais com casas decimais. **Não há sandbox**: valide em produção com valores baixos. A credencial legada `ci`/`cs` deixou de valer em 30/09/2026 e não é usada.
- **Recarga** (`POST /v1/payments/deposits`, sessão do jogador; `GET /v1/payments/deposits/:id`): o depósito é gravado **antes** de chamar o gateway, e o id dele vai como `transactionId`. Assim nada pago fica sem registro. Pagador = nome e CPF do jogador. Limites: R$ 1,00 a R$ 10.000,00 (`DEPOSIT_LIMITS`), no máximo 5 cobranças pendentes por jogador em 15 minutos (`429`). O jogador tem 15 min para pagar; pagamento confirmado depois disso ainda é creditado. Destino: saldo de Loterias ou de Games.
- **Confirmação**: os avisos (webhooks) da MisticPay **não são assinados**. Por isso situação e valor só valem depois de **conferidos no próprio gateway** (`/transactions/check`, com as credenciais da banca). Três caminhos disparam a conferência: o aviso do gateway, a tela do jogador (pergunta a cada 5 s enquanto aberta, e a API consulta no máximo a cada 5 s por depósito) e uma rodada automática a cada 1 min, para pendentes de 1 min a 2 dias. Quem credita é `pix_deposit_confirm`: uma vez por depósito (depósito travado), **só com o valor exato** (diferente = `SJ011`, não credita e registra no log da API) e na mesma transação do lançamento `DEPOSIT` na carteira. Pendente sem resposta por 24 h vira expirado; recusado/cancelado no gateway vira cancelado.
- **Só o titular credita sozinho**: o CPF/CNPJ de quem pagou (`clientDocument`) chega só no aviso, porque a consulta não o traz. Ele é gravado no depósito uma vez só (`pix_deposit_set_payer`) e só quando o endereço é assinado e o `transactionId` do aviso é o da cobrança; documento mascarado é ignorado. Pago com pagador = CPF do jogador: credita. Pagador diferente: **Em análise** (`PAYER_MISMATCH`). Pago sem o aviso com o pagador em 15 min: **Em análise** (`PAYER_UNKNOWN`). A tela do jogador avisa que o valor ficou retido. Em Carteira > Depósitos, o Gerente (`payments.manage`; o banco confere de novo em `pix_deposit_review`) **libera o crédito** ou **recusa** (a devolução ao pagador é feita fora do sistema). As duas ações são auditadas (`deposit.approve`/`deposit.reject`, com o valor e nunca o CPF do pagador). Nome e CPF/CNPJ de quem pagou (dado de terceiro) só aparecem para quem tem `payments.read` (Gerente e Financeiro); o Suporte vê apenas "Titular" ou "Outro titular". Pago e recusado são finais. Em domínios de desenvolvimento não há aviso, então todo pagamento vai para análise depois de 15 min.
- **Aviso do gateway**: cada cobrança leva o endereço `https://<domínio da banca>/integracoes/pagamentos/misticpay?d=<depósito>&t=<HMAC>`. A assinatura é derivada de `PAYMENTS_SECRET_KEY` e não vale para outro depósito. Antes, a origem precisa estar em **`PAYMENTS_WEBHOOK_IPS`** (IPs ou faixas da MisticPay): fora da lista = `403` no web, antes de chegar à API. Assim, nem um endereço de aviso vazado serve para informar um pagador falso. Vazio = aceita e registra no log o IP de cada aviso (use para descobrir os IPs e preencha); entrada inválida = recusa tudo. **Em produção, preencha sempre.** O web repassa à API `d`, `t` e o corpo JSON (até 16 KB) e não registra nada disso (o corpo tem o CPF de quem pagou). Domínio de desenvolvimento ou teste (`.localhost`, `.test`…) não recebe aviso. No proxy (nginx/Cloudflare), não registre a query string dessa rota, como na do cassino.
- **Banco** (migrations `payments` e `deposit_payer`): `payment_gateways` e `pix_deposits` com RLS forçado. A role de runtime só lê gateways, cria depósitos pendentes (trigger) e marca a última consulta. A situação e o pagador mudam só pelas funções `pix_deposit_attach/set_payer/close/confirm/review`; pago e recusado são finais e nada é apagado. A rodada usa `pix_deposits_due`, que percorre as bancas.
- Configuração: `PAYMENTS_SECRET_KEY` (obrigatória para ligar; trocar = o Gerente salva as credenciais de novo), `PAYMENTS_WEBHOOK_IPS` (obrigatória em produção) e `MISTICPAY_API_URL` (opcional). Ver `.env.example`.
- Testes: `apps/api/test/payments.test.ts` (MisticPay falsa: cifra, perfis, conferência do perfil no banco, criação, conferência, valor divergente, titular igual/diferente/não informado, liberar/recusar, aviso assinado/forjado/de outra transação, rodada entre bancas, limites, isolamento, privilégios) e, no web, `views/recharge-page.test.tsx`, `lib/payments-webhook.test.ts`, `views/admin/wallet-movements-page.test.tsx`.

## Saques

Saque via Pix pelo gateway ativo da banca (hoje a MisticPay, `POST /api/transactions/withdraw`, escopo **WITHDRAW_CREATE** na chave de acesso).

- **O que é sacável**: prêmios das loterias e ganhos do cassino. Recarga e bônus nunca. O valor **sai da carteira na solicitação** (prêmios das loterias primeiro, depois os do cassino; lançamento `WITHDRAWAL`) e **volta** (lançamento `WITHDRAWAL_REFUND`, nas mesmas bolsas) se o saque for cancelado, recusado ou não pago. Assim, o mesmo prêmio não é sacado duas vezes nem apostado depois de pedido.
- **Limites por banca** (Configurações > Pagamentos > Saques, só o Gerente; `GET`/`PUT /v1/admin/withdrawal-settings`): saques ligados/pausados, mínimo e máximo por saque, saques por dia por jogador (Brasília; cancelados, recusados e não pagos não contam) e **aprovação automática até** um valor. Padrão: R$ 10,00 a R$ 5.000,00, 3 por dia, automático até R$ 200,00. Até o limite, o saque vai direto ao gateway; acima, fica **em análise** para o Gerente. R$ 0,00 = todos passam pela aprovação.
- **Jogador**: `GET /v1/payments/withdrawals` (os 50 mais recentes, o sacável e os limites de hoje), `POST /v1/payments/withdrawals` `{ amountCents, keyType, keyValue, idempotencyKey }` e `POST /v1/payments/withdrawals/:id/cancel` (só em análise). A chave de idempotência (UUID, uma por confirmação) faz o clique duplo ou o reenvio devolver o mesmo saque.
- **Situações**: `REVIEW` (em análise) → `QUEUED` (aprovado/automático) → `SENDING` (enviando) → `PROCESSING` (no gateway, com o id de lá) → `PAID`; ou `FAILED` (o gateway não pagou), `REJECTED` (o Gerente recusou), `CANCELED` (o jogador cancelou), todos devolvendo o valor. O jogador vê "Em análise", "Processando", "Pago", "Não pago", "Recusado" e "Cancelado".
- **Envio sem pagar duas vezes**: a MisticPay **não aceita um id nosso** no saque, então reenviar pode pagar em dobro. O saque passa a `SENDING` antes de chamar o gateway (só um envio por saque, garantido no banco) e:
  - aceito: `PROCESSING` com o id da transação de lá;
  - recusado com certeza (credencial, pedido inválido): volta para análise com o motivo, sem mexer no dinheiro; sem gateway ativo: também volta para análise;
  - limite de requisições (HTTP 429): volta para a fila e a rodada envia de novo;
  - **sem resposta** (fora do ar, tempo esgotado, resposta ilegível): **nunca reenvia**. A rodada procura o saque no gateway pela descrição (`Saque <id>`); achando, segue para `PROCESSING`. Sem achar em 10 minutos, o Gerente vê "Foi pago" / "Não foi pago" em Carteira > Saques e conclui depois de conferir no painel do gateway (a confirmação avisa que "não foi pago" num saque pago paga duas vezes).
- **Conclusão**: só depois de consultar a transação no próprio gateway (`/transactions/check`, tipo `RETIRADA`). Três caminhos disparam a consulta: o aviso do gateway (webhook; o corpo é ignorado), a rodada automática (a cada 1 min, pendentes até 30 dias) e a aprovação do Gerente (que envia na hora). Pago: guarda quem recebeu segundo o gateway; se o CPF/CNPJ não for o do jogador, fica registrado e destacado no painel. No gateway sem conclusão há mais de 1 hora, o Gerente também pode concluir à mão.
- **Aviso do gateway**: `https://<domínio da banca>/integracoes/pagamentos/misticpay?s=<saque>&t=<HMAC>`, a mesma rota dos depósitos (que usam `?d=`), com assinatura separada (a de um depósito não serve para um saque). Vale a mesma lista de IPs (`PAYMENTS_WEBHOOK_IPS`).
- **Banco**: tabela `pix_withdrawals` (RLS por banca; nada é apagado; saque concluído não muda; quem, quanto, de onde e para qual chave nunca mudam; só as passagens de situação previstas). Todo movimento e toda passagem são funções do banco com o saque travado (`pix_withdrawal_request`, `_cancel`, `_review`, `_claim`, `_sent`, `_unsend`, `_requeue`, `_hold`, `_settle`, `_resolve`); a role de runtime só lê. Pedidos simultâneos do mesmo jogador se enfileiram na carteira (saldo e limite do dia valem para todos). Aprovar, recusar e concluir à mão exigem Gerente ativo (o banco confere) e vão para a auditoria. Migration `20261028000000_withdrawals`.
- **Avisos no app instalado**: "Saque solicitado" (com o alerta para o titular, se não foi ele) e "Saque pago" (ver "Notificações").
- **Celular como chave**: vai à MisticPay como `+55` + DDD + número (a documentação não traz exemplo). Antes de liberar para os jogadores, faça um saque de valor baixo para cada tipo de chave.
- Testes: `apps/api/test/withdrawals.test.ts` (MisticPay falsa: reserva e origem, automático/análise, cancelamento, chaves, idempotência em paralelo, limites, isolamento, aprovação/recusa e perfis, pago/falhou/outro titular, recusa do gateway, 429, envio sem resposta encontrado ou concluído à mão, sem gateway, aviso assinado, configuração, travas do banco, Resumo da Operação) e, no web, `lib/withdrawal*.test.ts`, `app/withdrawal-actions.test.ts`, `views/withdrawal-*.test.tsx`, `views/admin/wallet-movements-page.test.tsx`, `components/admin/WithdrawalSettingsCard.test.tsx`, `lib/payments-webhook.test.ts`.

## Horóscopo

Tela em `/loterias/horoscopo` (barra de ferramentas das Loterias e atalho do início): previsão do dia do signo (abre no signo do jogador, calculado **no servidor** pela data de nascimento; só o signo vai para o navegador), palpites (grupo, dezenas, centenas e milhares, com "Toque para copiar") e "Apostar agora".

**Integração** (API de horóscopo da Loteria Integrada, `HOROSCOPE_API_URL` e `HOROSCOPE_API_TOKEN`): uma requisição traz os 12 signos do dia.

- **Busca diária agendada na API**: todo dia às `HOROSCOPE_SYNC_AT` (padrão 00:01, Brasília) e ao iniciar, se hoje ainda não está no cache. "Ainda não há previsões" (o provedor ainda não publicou), previsão de outro dia e falhas passageiras (rede, 5xx) tentam de novo a cada `HOROSCOPE_RETRY_MINUTES` (padrão 15), sem passar da próxima busca diária. Token recusado ou limite diário: só na próxima busca diária, com erro no log. Uma busca por vez. `pnpm horoscope:fetch` busca na hora.
- **Cache** em `horoscope_readings` (global, uma linha por data e signo; CHECKs de signo, texto, dezenas e cores). Gravação idempotente: igual não muda nada; correção do provedor no mesmo dia atualiza. A role de runtime não exclui.
- **O jogador nunca chama o provedor**: `GET /v1/horoscope` (credencial da banca + sessão) lê só o cache de hoje. Sem previsão (dia ainda não publicado, integração desligada), a tela usa a leitura gerada localmente (`apps/web/lib/horoscope.ts`), determinística pela data e pelo signo.
- **Validação da resposta**: signo pelo nome (a ordem pode variar), com ou sem acento; dezenas `78-04-46-45-68` (formato real) ou `04, 18, 29` (documentação); cores separadas por vírgula (`Verde-pistache-claro` é uma cor só); texto sem caracteres de controle, até 2.000 caracteres, exibido como texto (nunca HTML). Item inválido é descartado sozinho, com o motivo no log.
- **Palpites com a previsão do provedor**: as dezenas dele; grupo da 1ª dezena; centena e milhar de cada dezena com os algarismos da frente sorteados pela data e pelo signo.
- **Segurança**: token só no servidor da API (a varredura do bundle confere que não chega ao navegador), HTTPS, sem seguir redirecionamento, tempo limite, resposta de até 256 KB. Com mais de uma instância da API, cada uma agenda a sua busca (gravação idempotente: no máximo uma requisição a mais por dia por instância).

## Atrasados

Tela em `/loterias/atrasados` (barra de ferramentas das Loterias e atalho do início): o jogador escolhe a loteria (sorteios da banca com resultado ligado, em sanfona por grupo) e vê os 25 bichos do que está há mais tempo sem dar na **cabeça** (1º prêmio) ao mais recente, com "Toque para copiar" (grupo com 2 dígitos) e "Apostar agora". O sorteio escolhido fica na URL (`?sorteio=<id>`).

**Integração** (API de atrasados da Loteria Integrada, `OVERDUE_API_URL` e `OVERDUE_API_TOKEN`): `tipo_busca=grupo`, `posicao=1` e a extração do resultado ligado ao sorteio. O endpoint real é `https://api.lotoserv.com/atrasados/v1/`; o da documentação (`/atrasados/consulta/v1/`) dá 404.

- **Cache por loteria/extração** em `overdue_snapshots` (global; o último dia de saída de cada grupo, CHECKs de formato). O jogador nunca chama o provedor: a API busca só quando o cache venceu, por resultado novo (ou correção) do sorteio ou depois de `OVERDUE_CACHE_MINUTES` (padrão 30). Os dias são contados aqui pela data, então o cache continua certo depois da meia-noite. Uma busca por vez por loteria/extração (pedidos simultâneos esperam a mesma); cache de busca mais antiga não substitui o de outra instância.
- **Falhas**: provedor fora do ar, token recusado ou resposta inválida usam o cache vencido; sem cache, `503 SERVICE_UNAVAILABLE` e a tela pede para tentar de novo. Loteria fora do plano (`403`) usa os resultados guardados aqui (o último ano) e não pergunta de novo até o prazo do cache. Integração desligada: sempre os resultados guardados.
- **Validação da resposta**: mesma loteria, extração e posição pedidas; os 25 grupos sem repetição (grupo como número ou texto, como o provedor manda); data da última saída válida e não depois da data de referência, ou "nunca saiu". Resposta inválida não entra no cache.
- **Segurança**: token só no servidor da API (a varredura do bundle confere), HTTPS, sem seguir redirecionamento, tempo limite de 8 s, resposta de até 128 KB. Do provedor só as datas chegam ao jogador.

| Método | Rota                    | Acesso                                  | Comportamento                                                                                                                                                                        |
| ------ | ----------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/v1/draws/:id/overdue` | credencial da banca + sessão do jogador | Os 25 grupos (`lastDate`, `days`) e `source` (`provider`/`history`). `404` igual para sorteio de outra banca, inativo ou sem resultado ligado; `503` provedor indisponível sem cache |

## Pules premiadas (painel)

Operação > Prêmios (`/premios` no painel; `tickets.read`, todos os perfis): filtros por período da data do jogo (atalhos Ontem, Hoje, 7D, 30D, Mês e Mês Ant., até 93 dias e até hoje), extração, promotor, apostador e faixa de prêmio em reais; Seção, Rota e Grupo de Cobrança ficam visíveis mas sem efeito até os cadastros existirem. Resultado: quantidade, total em prêmios e a lista (maiores prêmios primeiro, paginada).

- **Dados**: `pule_prizes`, um registro por pule premiada (jogo, número, sorteio e apostado como na venda, prêmio, itens premiados e quando foi apurado), gravado pela apuração (ver "Apuração de prêmios"), com RLS por banca. A role de runtime só lê; ninguém altera nem apaga um prêmio (nem a dona das tabelas: trigger).
- **Avisos**: acima da lista, as pules cujo resultado o provedor **corrigiu depois do pagamento** e que, pelo resultado corrigido, teriam outro prêmio (pago, corrigido e a diferença). O pago não muda sozinho: o operador confere e ajusta a carteira. E o chip **Aguardando apuração**: pules do filtro cujo sorteio já passou e que ainda não foram apurados (resultado que não chegou, sorteio sem resultado ligado ou ainda na carência).
- `GET /v1/admin/prizes?from=&to=` (+ `promoterId`, `userId`, `drawId`, `minPrizeCents`, `maxPrizeCents`, `page`, `pageSize`): `400` para período inválido, futuro, invertido ou acima de 93 dias, e faixa de prêmio invertida.

## Resumo da Operação (painel)

Operação > Resumo da Operação (`/resumo-operacao`; `operation.read`: Gerente e Financeiro): abre no mês até hoje, com filtro de período (atalhos, até 366 dias) e promotor (só os indicados dele; a comissão é a que ele recebeu). `GET /v1/admin/operation-summary?from=&to=&promoterId=`, uma consulta só ao banco.

- **Novos usuários**: cadastros no período. **Resultado**: jogado (pules de Loterias e Fazendinha pela data da venda), prêmios (pules premiadas apuradas no período), bruto, comissão (pagamentos `COMMISSION` creditados no período) e líquido. **Loterias**: turnover e payout. **Saldos**: soma das carteiras agora, lançamentos e bônus creditados no período (crédito pelo painel e ajustes manuais, só a parte positiva).
- **Depósitos e saques**: pagos no período (pela data do pagamento) e o líquido (depósitos − saques). **FTD**: cadastros do período que já têm um depósito pago, a % sobre os cadastros e a média do primeiro depósito. **Disponível para saques**: prêmios das loterias + do cassino nas carteiras, agora.
- **Ainda sem origem no sistema** (vem zerado, listado em `unavailable` e numa nota na tela): o cassino.

## Relatório geral (painel)

Relatórios > Relatório geral (`/relatorios/geral`; `operation.read`): uma linha por usuário com movimento no período, do ponto de vista da banca. Abre em hoje, ordenado pelas maiores vendas; colunas ordenáveis (o Líquido Geral não), paginado. Filtros: período (atalhos, até 366 dias), promotor (ele e os indicados), apostador e tipo (Apostador/Promotor); Seção, Rota e Grupo de Cobrança aguardam os cadastros. `GET /v1/admin/reports/general?from=&to=` (+ `promoterId`, `userId`, `type`, `sort`, `dir`, `page`, `pageSize`); a ordenação vem de uma lista fixa (nunca vai para o SQL como texto).

- **Vendas**: pules de Loterias e Fazendinha pela data da venda. **Comissão / Comissão Amigo**: pagamentos de comissão creditados no período (fechamento do mês), divididos como no cálculo do fechamento: amigo = apostado × % indique e ganhe; o resto do pagamento é a parte de promotor (a soma bate com o creditado). **Prêmios**: pules premiadas apuradas no período. **Outros**: créditos pelo painel e ajustes manuais (todas as bolsas).
- **Líquido** = vendas − prêmios − comissão − comissão amigo. **Líquido Geral** = líquido − outros.

## Vendas por extração (painel)

Relatórios > Loterias > Vendas por extração (`/relatorios/loterias/vendas-por-extracao`; `operation.read`): os dados só aparecem depois de pesquisar. Filtros: período pela **data do jogo** (atalhos; até 366 dias e até o fim da janela de apostas, hoje + 6, porque as vendas para os próximos dias também contam), promotor (os indicados) e apostador; Seção e Rota aguardam os cadastros. Uma linha por extração (nome e hora da venda, por horário), com pules, vendas de Loterias e Fazendinha, total, prêmios (apuração) e líquido (vendas − prêmios), e o total; "Filtrar extração" procura por nome, código ou horário na própria tela e recalcula o total. Sorteio excluído do cadastro continua aparecendo, sem horário. `GET /v1/admin/reports/sales-by-draw?from=&to=` (+ `promoterId`, `userId`).

## Geral cassino (painel)

Relatórios > Cassino > Geral cassino (`/relatorios/cassino/geral`; `operation.read`): os dados só aparecem depois de pesquisar. Filtros: período (atalhos; até 366 dias e até hoje), promotor (os indicados), apostador e tipo (Apostador ou Promotor); Seção e Rota aguardam os cadastros. Uma linha por usuário com turnover (apostado), payout (prêmios) e líquido (turnover − payout), do ponto de vista da banca, e o total. **O sistema ainda não tem cassino**: a API devolve o relatório vazio com `available: false` (a tela avisa que os valores aparecem zerados), mas já confere os filtros como os outros relatórios (promotor inexistente ou de outra banca = `404`). `GET /v1/admin/reports/casino/general?from=&to=` (+ `promoterId`, `userId`, `type`).

## Extrato do apostador (painel)

Carteira > Extrato apostador (`/extrato`; `users.read`, todos os perfis): período (atalhos, até 366 dias e até hoje) e o apostador (obrigatório; o campo não tem "Todos"). Depois de pesquisar: saldo inicial, entradas, saídas e saldo final do período e os lançamentos da carteira (`wallet_entries`), mais recentes primeiro e paginados: data/hora, tipo (aposta Loterias/Fazendinha com o número do pule, crédito pelo painel com o motivo e o operador, ajuste manual, comissão, saldo anterior), o movimento de cada bolsa, o total e a **carteira de apostas depois do lançamento**. `GET /v1/admin/users/:id/statement?from=&to=` (+ `page`, `pageSize`); apostador de outra banca ou inexistente = `404`.

- Os saldos são da carteira de apostas (saldo + bônus + prêmios), que o banco mantém igual à soma dos lançamentos: o saldo de cada linha = o que havia antes do período + os lançamentos até ela (calculado antes da paginação, então vale em qualquer página). Games aparece à parte, sem entrar no saldo.

## Depósitos e Saques (painel)

Carteira > Depósitos (`/depositos`) e Carteira > Saques (`/saques`) (`users.read`). Mesmos filtros nas duas (apostador, status do tipo, período com atalhos até 366 dias, promotor; Seção, Rota e Grupo de Cobrança aguardam os cadastros), na URL.

- **Depósitos**: os da Recarga Pix (ver "Pagamentos"), mais recentes primeiro e paginados: data/hora, apostador (link), pagador ("Titular" ou nome e CPF/CNPJ de outro titular), destino (Loterias/Games), gateway, valor e situação (com o motivo da análise e quem decidiu), mais o total pago no filtro. Em análise, o Gerente vê "Liberar crédito" e "Recusar", com confirmação. `GET /v1/admin/deposits?from=&to=` (+ `userId`, `promoterId`, `status`, `page`, `pageSize`); `POST /v1/admin/deposits/:id/review` `{ approve }`.
- **Saques**: mais recentes primeiro e paginados: data/hora, apostador (link), chave Pix (com máscara; "Pago a outro titular" em destaque quando o gateway informa outro CPF/CNPJ), origem (prêmios das loterias e do cassino), valor e situação (com o motivo, quem decidiu e o id da transação no gateway), mais o total pago. O Gerente aprova ou recusa (com motivo opcional, mostrado ao jogador) os que estão em análise e conclui à mão os envios sem resposta ("Foi pago" / "Não foi pago", só depois de conferir no painel do gateway). `GET /v1/admin/withdrawals?from=&to=` (+ `userId`, `promoterId`, `status`, `page`, `pageSize`); `POST /v1/admin/withdrawals/:id/review` `{ approve, note? }`; `POST /v1/admin/withdrawals/:id/resolve` `{ paid }`. Detalhes na seção "Saques".

## CRM (painel)

CRM > Apostadores inativos (`/crm/inativos`) e CRM > Nunca depositantes (`/crm/nunca-depositantes`), no visual de `IMAGES/CRM.png` (`users.read`, todo perfil). Só contas **ativas** da banca; depósito = Recarga Pix **paga** (crédito pelo painel não conta); dias no calendário de Brasília.

- **Apostadores inativos**: quem já depositou e está entre X e Y dias sem depositar (padrão: 1 a 7; atalhos 7, 15, 30 e 60 dias = de 1 até N). Colunas: nome (link), tipo (apostador/promotor), promotor associado (quem indicou, se for promotor), código (ID), telefone (link para o WhatsApp), valor total depositado, dias sem depositar (o último depósito no título), dias de relacionamento (desde o cadastro) e depósitos feitos. Padrão: os há mais tempo sem depositar primeiro.
- **Nunca depositantes**: cadastrados há X a Y dias sem nenhum depósito pago (padrão: 0 a 7; atalhos de 0 até N). Colunas: nome, tipo, promotor associado, código, telefone, data do cadastro e dias de relacionamento. Padrão: os cadastros mais antigos primeiro.
- **Filtros na URL** (link compartilhável): `min`, `max`, `promotor`, `ordem`, `dir`, `page`, `pageSize`; valor inválido vira o padrão. Todas as colunas ordenam (menos a data do cadastro, que é a mesma ordem dos dias de relacionamento).
- **Exportar Excel**: CSV com os filtros e a ordem da tela (todas as páginas, até 10.000 linhas), no padrão do CSV de apostadores (";", BOM, texto que começa com `=`/`+`/`-`/`@` não vira fórmula). `/crm/inativos/exportar` e `/crm/nunca-depositantes/exportar`.
- **API**: `GET /v1/admin/crm/inactive` e `GET /v1/admin/crm/never-deposited` `?minDays=&maxDays=` (0 a 3650, mínimo ≤ máximo) (+ `promoterId`, `sort`, `dir`, `page`, `pageSize`). Uma consulta por página, parametrizada, filtrando a banca além do RLS; promotor que não é promotor da banca = `404`. Testes: `apps/api/test/crm.test.ts` e, no web, `lib/admin/crm-query.test.ts`, `lib/admin/crm-csv.test.ts`, `views/admin/crm-page.test.tsx`.

## Notificações (app instalado)

Notificações Web Push para quem usa o app instalado na tela inicial (PWA). Chaves VAPID em `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY` (geradas pelo `pnpm setup:env`; trocar o par invalida as inscrições) e contato em `WEB_PUSH_SUBJECT`. Sem as chaves, tudo fica desligado.

- **Permissão no login**: no app instalado, o toque em "Entrar" abre a janela de permissão do sistema (precisa ser no toque: o iPhone só permite assim, e só no app instalado, iOS 16.4+). Só aparece se o jogador ainda não respondeu; o login não espera a resposta. Numa aba do navegador não pede.
- **Inscrição do aparelho**: com a conta aberta, o app (service worker `public/sw.js`, só notificações, sem cache de páginas) inscreve o aparelho e manda para `POST /v1/me/push-subscriptions`, a cada abertura. Guardada em `push_subscriptions` (por banca e jogador, RLS; o mesmo aparelho com outra conta passa a ser dela; até 10 aparelhos por jogador). **Sair da conta** tira o aparelho (`DELETE`) e cancela a inscrição.
- **"Resultado saiu"**: resultado novo recebido pelo webhook avisa, em cada banca, quem apostou (Loterias ou Fazendinha) nos sorteios ligados àquela extração no dia: uma notificação por jogador e sorteio, que abre o resultado. Em segundo plano (o webhook responde sem esperar). Reenvio igual, correção e resultado de antes de ontem não avisam; o `results:fetch` (recuperação manual) também não.
- **"Pule premiada"**: quando a apuração paga, avisa quem ganhou (um aviso por jogador e dia do jogo, com o pule ou a quantidade e o total), que abre as premiadas do dia.
- **Saques**: "Saque solicitado" quando o pedido é criado (valor e se está em análise ou sendo processado, com o alerta "Não foi você? Troque sua senha e fale com o suporte", para o titular perceber um saque feito por outra pessoa) e "Saque pago" quando o gateway confirma o pagamento ou o Gerente conclui como pago. A mesma tag por saque: o "pago" substitui o "solicitado". Só valor e situação, nunca a chave Pix; abrem "Meus saques". Em segundo plano: falha no aviso não afeta o saque.
- **Segurança**: a API só aceita endpoint HTTPS dos serviços de push dos navegadores (Google, Apple, Mozilla, Microsoft), sem porta nem credenciais (sem isso, um endpoint forjado faria a API chamar qualquer endereço). A chave privada fica só na API (a varredura do bundle confere). Conteúdo cifrado de ponta a ponta pelo protocolo; o service worker só abre caminhos do próprio app. Inscrição expirada (404/410) é apagada no envio; o log nunca traz o endpoint.

| Método | Rota                        | Acesso                                  | Comportamento                                                                       |
| ------ | --------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/v1/me/push-subscriptions` | credencial da banca + sessão do jogador | `{endpoint, keys: {p256dh, auth}}` → `204`; `400` formato/serviço; `503` desligadas |
| DELETE | `/v1/me/push-subscriptions` | credencial da banca + sessão do jogador | `{endpoint}` → `204` (só o aparelho do próprio jogador)                             |

## Personalização

Configurações > Personalização, em abas: **Identidade visual**, **Cards do início** (só o Gerente: `branding.read`/`branding.manage`) e **Valores** (o percentual do "Indique e ganhe": `commissions.read`/`commissions.manage`, Gerente altera e o Financeiro consulta). Cada perfil vê só as abas que pode abrir; o item do menu aparece para quem pode ver alguma (o Financeiro abre direto em Valores). O endereço antigo `/comissoes` leva para `/personalizacao/valores`. O **Mural** fica em Configurações (`murals.read`/`murals.manage`).

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
- **Indique e ganhe (X%)**: igual para a banca toda, definido pelo Gerente em **Personalização > Valores** no painel (`tenant_settings`, com auditoria). 0% desliga.
- **Promotor (Y%)**: a comissão de cada promotor. Se quem indicou é promotor no fechamento, recebe **X% + Y%** (ex.: 3% + 7% = 10%).
- **Base**: o valor apostado pelos indicados no mês (Brasília, pela data da aposta). Ganho arredondado para baixo no centavo.
- **Fechamento mensal**: **sem tela no painel por enquanto** (a prévia e o "Fechar mês" saíram da Personalização > Valores); a API continua oferecendo a prévia e o fechamento (`/v1/admin/commissions/months/:mes` e `/close`, só meses encerrados, uma vez por mês). Enquanto não houver tela, nenhuma comissão é paga. A função `commission_close_month` grava o fechamento e cada pagamento e **credita o Saldo** na mesma transação (movimentação `COMMISSION`). Quem indicou e está **bloqueado** não recebe (fica como "não recebeu"). Mês fechado fica congelado: mudar percentuais depois não altera o que foi pago.
- **Perfis**: Gerente altera o X% e fecha; Financeiro só consulta; Suporte não vê. O banco confere de novo que quem fecha é Gerente ativo.
- **Painel**: lista de usuários com as colunas "Indicado por" e "Promotor"; no detalhe, "Indicado por" e "Promotor do jogador" separados.

## Contrato monetário

- **Todo valor monetário é um inteiro em centavos** (`1050` = R$ 10,50). No banco são `bigint`, com CHECK de não negatividade e de soma ≤ `Number.MAX_SAFE_INTEGER`.
- `totalAvailableJb = balanceJb + bonusJb + prizesJb` e `totalAvailableGames = balanceGames + bonusGames + prizesGames`, calculados na leitura e não persistidos.
- `withdrawable = prizesJb + prizesGames` (prêmios das loterias + do cassino): o que pode ser sacado. Saques pendentes já saíram da carteira.
- Os totais são só uma convenção de apresentação e **não** definem elegibilidade para apostas ou saques.
- Não há endpoint de alteração de saldo e a role de runtime não tem `UPDATE` em `wallets`; um trigger exige saldo zero na criação.
- **Saldo conciliado**: toda mudança de `balance_jb`, `prizes_jb` e `bonus_jb` precisa de uma movimentação em `wallet_entries` (somente inclusão, inclusive para a dona das tabelas). Ao fim de cada transação o banco confere saldo = soma das movimentações e recusa o commit se não bater. As bolsas de games não mudam (ainda não há movimentação delas).
- Tipos de movimentação: `FAZENDINHA_BET` (débito da compra, pela função `fazendinha_debit`), `MANUAL_ADJUSTMENT` (crédito/estorno com motivo), `OPENING_BALANCE` (saldos que existiam antes do registro, criados pela migration) e `PRIZE` (prêmio pago pela apuração na bolsa de prêmios, um por pule premiada), entre outros.
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

## Limpeza diária

A API chama `maintenance_purge()` ao subir e a cada 24 h (`MaintenanceService`). A função, no banco, apaga só o descartável, com prazos fixos nela: sessões de jogador e de operador encerradas há mais de 7 dias, tentativas de login com mais de 1 dia e consultas ao provedor de resultados com mais de 90 dias (a cota é do mês corrente). Dinheiro, prêmios, rodadas do cassino e auditoria nunca entram. A role de runtime não tem `DELETE` nessas tabelas: só executa a função, que entra em cada banca. O log registra quantas linhas saíram. Logs do servidor e espaço em disco: ver `HOSPEDAGEM.md`. Teste: `maintenance.test.ts`.

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

`results-quota.test.ts` cobre a proteção da cota (o que consultar, espera, limite do mês, novas tentativas perto do limite, `401`, falha de rede, `--force`, registro somente inclusão). `results.test.ts` cobre os resultados: normalização (exemplo da documentação do provedor, prêmios "0", 10 prêmios, Federal com 5 dígitos, cada recusa), token do webhook (cada cabeçalho, divergência, desativado), idempotência inclusive simultânea, correção com histórico, sem apagar prêmios ou campos já gravados, privilégios e CHECKs do banco, a leitura do jogador e o cliente da consulta (parâmetros, 404, sem repetir em 401, repetição em 5xx/rede, tamanho, formato).

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
- Painel: só a página de usuários existe. O operador ainda não troca a própria senha (o Gerente gera uma nova em Operadores), nem tela para consultar a auditoria (os registros ficam em `audit_logs`).
- A busca de usuários usa `ILIKE` sem índice de trigrama: adequada para milhares de usuários por banca; com centenas de milhares, criar índice `pg_trgm`.
- Troca de senha só logado (sem exigir a senha atual, ver "Perfil"); sem recuperação de senha ("esqueci") e sem listar/encerrar sessões avulsas do cliente.
- O bloqueio de 5 falhas é por CPF (ou e-mail do operador): um atacante pode bloquear temporariamente o login de um CPF conhecido (efeito colateral aceito do bloqueio por conta). O limite por IP (ver "Limite de requisições") depende de o proxy na frente do web preencher o X-Forwarded-For corretamente; redes móveis com IP compartilhado dividem o mesmo limite por IP (por isso os limites por IP são generosos e os limites finos são por sessão).
- Linhas antigas de `sessions` não são apagadas (só expiram); falhas de login antigas são limpas a cada falha nova.
- Redis e BullMQ só previstos; não há filas nem dependências instaladas.
- Resolução de banca consulta o banco a cada requisição (sem cache).
- Sem CORS configurado ou headers de segurança adicionais na API, pois ela não é exposta ao navegador nesta fase.
- Telefone só no formato nacional brasileiro; CPF só com validação de formato e dígitos verificadores.
