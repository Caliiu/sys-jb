# Deploy na VPS (passo a passo)

Como colocar o sistema no ar numa VPS Ubuntu 24.04, do zero até a primeira banca funcionando. Para escolher a VPS
(tamanho, provedor, região), veja `HOSPEDAGEM.md`.

**Como fica no servidor:**

```
Internet ──443──▶ Nginx (HTTPS) ──▶ Web Next.js (127.0.0.1:3000) ──▶ API NestJS (127.0.0.1:4000) ──▶ PostgreSQL (Docker, 127.0.0.1:5433)
```

Só o Nginx fica exposto. Web, API e banco escutam apenas em `127.0.0.1`.

**Nos exemplos, troque:**

| Exemplo | Troque por |
|---|---|
| `minhabanca.com.br` | domínio da banca (o app dos jogadores) |
| `admin.meusistema.com.br` | domínio do painel administrativo (um só para todas as bancas) |
| `minhabanca` | slug da banca (minúsculas, números e hífen) |
| `203.0.113.10` | IPv4 da VPS |
| `deploy` | usuário que vai rodar o sistema |

---

## 0. Antes de começar

- [ ] **Código salvo no git** (repositório privado no GitHub, GitLab etc.). O servidor vai baixar o código de lá.
- [ ] **VPS contratada**: Ubuntu 24.04, São Paulo, IPv4 fixo, 4 vCPU / 8 GB (ver `HOSPEDAGEM.md`).
- [ ] **DNS apontado**: no painel do domínio, crie registros **A** apontando para o IP da VPS:
  - `minhabanca.com.br` → `203.0.113.10`
  - `www.minhabanca.com.br` → `203.0.113.10`
  - `admin.meusistema.com.br` → `203.0.113.10`

  Confira antes de seguir (pode levar alguns minutos): `nslookup minhabanca.com.br` precisa responder o IP da VPS.
- [ ] **Credenciais em mãos**: PlayFivers (gere token e secret **novos** para produção), MisticPay (chave com permissão
  de saque `WITHDRAW_CREATE`), Loteria Integrada (tokens de resultados, horóscopo e atrasados).

---

## 1. Primeiro acesso e segurança básica

Entre como root (pelo painel do provedor ou `ssh root@203.0.113.10`) e crie o usuário do sistema:

```bash
adduser deploy
usermod -aG sudo deploy

# Copia a sua chave SSH do root para o deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

> Ainda não tem chave SSH? No **seu computador**: `ssh-keygen -t ed25519` e depois
> `ssh-copy-id deploy@203.0.113.10`.

Teste em **outro terminal** que `ssh deploy@203.0.113.10` entra. Só depois desligue o login por senha e o do root:

```bash
sudo nano /etc/ssh/sshd_config.d/99-seguranca.conf
```

```
PasswordAuthentication no
PermitRootLogin no
```

```bash
sudo systemctl restart ssh
```

Firewall (só SSH, HTTP e HTTPS) e atualizações automáticas de segurança:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

sudo apt update && sudo apt upgrade -y
sudo apt install -y unattended-upgrades git curl
sudo dpkg-reconfigure -plow unattended-upgrades
```

**Swap** (a compilação do web usa 1 a 2 GB de RAM; sem swap, uma VPS de 4 GB pode travar no build):

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

A partir daqui, tudo como o usuário **deploy**.

---

## 2. Instalar Docker, Node.js, pnpm e Nginx

**Docker** (só para o PostgreSQL):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
```

Saia e entre de novo no SSH para o grupo `docker` valer. Teste: `docker ps`.

> Quem está no grupo `docker` tem poder de root na máquina. Não adicione outros usuários a ele.

Limite de log dos containers, para não encher o disco:

```bash
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker
```

**Node.js 22 LTS e pnpm** (o projeto exige Node 20.19 ou superior e usa pnpm 10.34.5):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@10.34.5 --activate
node -v && pnpm -v
```

**Nginx e Certbot** (HTTPS gratuito com Let's Encrypt):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

**Limite dos logs do sistema** (journald guarda os logs da API e do web):

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=1month\n' | sudo tee /etc/systemd/journald.conf.d/sysjb.conf
sudo systemctl restart systemd-journald
```

---

## 3. Baixar o código

```bash
sudo mkdir -p /srv/sysjb
sudo chown deploy:deploy /srv/sysjb
git clone git@github.com:SEU-USUARIO/sys-jb.git /srv/sysjb
cd /srv/sysjb
```

> Repositório privado: cadastre uma **deploy key** (chave SSH só de leitura) no GitHub para o servidor:
> `ssh-keygen -t ed25519 -f ~/.ssh/github_deploy` e cole o conteúdo de `~/.ssh/github_deploy.pub` em
> *Settings > Deploy keys* do repositório.

---

## 4. Configurar o `.env` de produção

Gere um `.env` novo com senhas aleatórias. **Nunca copie o `.env` do seu computador.**

```bash
cd /srv/sysjb
node scripts/setup-env.mjs
chmod 600 .env
nano .env
```

O gerador cria chaves para as bancas de teste (`trevo`, `aurora`, `boreal`). Ajuste para as suas bancas e preencha as
integrações:

**Chaves de serviço das bancas.** Gere uma chave para cada banca com `openssl rand -hex 24`. A **mesma chave** entra
nas duas variáveis: na API indexada pelo **slug**, no web indexada pelo **domínio**:

```ini
TENANT_SERVICE_KEYS=minhabanca=CHAVE_DA_MINHABANCA
WEB_SERVICE_KEYS=minhabanca.com.br=CHAVE_DA_MINHABANCA,admin.meusistema.com.br=VALOR_DA_ADMIN_SERVICE_KEY
WEB_ADMIN_HOSTNAME=admin.meusistema.com.br
```

(`ADMIN_SERVICE_KEY` já vem gerada no `.env`; copie o valor dela para o `admin.meusistema.com.br=` acima.)

**Proxy:**

```ini
API_TRUST_PROXY=false
WEB_TRUSTED_PROXY_HOPS=1    # 1 = só o Nginx na frente; 2 = Cloudflare + Nginx
```

**Cassino (PlayFivers):**

```ini
PLAYFIVERS_AGENT_TOKEN=...
PLAYFIVERS_SECRET_KEY=...
PLAYFIVERS_AGENT_CODE=...
PLAYFIVERS_WALLETS=Carteira Oficial (Slots)
CASINO_WEBHOOK_IPS=          # deixe vazio por enquanto; preencha no passo 11
```

**Pagamentos:**

```ini
PAYMENTS_WEBHOOK_IPS=        # deixe vazio por enquanto; preencha no passo 11
```

As credenciais da MisticPay **não vão no `.env`**: o Gerente cadastra no painel (passo 10).

**Loteria Integrada:** `RESULTS_API_TOKEN`, `HOROSCOPE_API_TOKEN`, `OVERDUE_API_TOKEN` (e `RESULTS_API_MONTHLY_QUOTA`
com a cota do seu contrato).

**Notificações:** `WEB_PUSH_SUBJECT=mailto:seu-email@dominio.com.br`.

> **Guarde uma cópia do `.env` num cofre de senhas** (Bitwarden, 1Password). Sem ele não dá para restaurar o sistema:
> as senhas do banco e a `PAYMENTS_SECRET_KEY` (que decifra as credenciais do gateway) estão nele. Depois que o banco
> for criado (passo 5), **não troque** as senhas `SYSJB_*` nem rode o gerador com `--force`.

---

## 5. Subir o banco de dados

```bash
cd /srv/sysjb
pnpm db:up
docker ps    # postgres "healthy", porta 127.0.0.1:5433
```

O primeiro start cria as roles `sysjb_migrator` (dona das tabelas) e `sysjb_app` (usada pela API, sem acesso de
administrador) e os bancos `sysjb` e `sysjb_test`. Os dados ficam no volume Docker `sysjb_pgdata`.

---

## 6. Instalar dependências, compilar e migrar

```bash
cd /srv/sysjb
pnpm install --frozen-lockfile
pnpm build         # contracts -> database -> API e web (alguns minutos)
pnpm db:migrate    # cria todas as tabelas, regras e funções
```

> **Não rode `pnpm db:seed` em produção.** Ele cria as bancas de teste (`trevo`, `aurora`, `boreal`) com domínios
> `.localhost`.

Se o build parar com "JavaScript heap out of memory", confira o swap (passo 1) e rode de novo.

---

## 7. Criar a banca

Ainda não existe tela para criar banca: é feito direto no banco, com a role dona das tabelas. Ao criar, o banco já
cadastra os sorteios padrão sozinho.

```bash
cd /srv/sysjb
docker compose exec postgres psql -U sysjb_migrator -d sysjb -c "
INSERT INTO tenants (slug, name, domain, primary_color, secondary_color, updated_at)
VALUES ('minhabanca', 'Minha Banca', 'minhabanca.com.br', '#DF2120', '#F4F1EA', now());"
```

Regras: `slug` em minúsculas (o mesmo do `TENANT_SERVICE_KEYS`), `domain` exatamente como o jogador digita (sem
`https://`, sem `www`, sem barra), cores em `#RRGGBB`, nome de 2 a 40 caracteres. Nome, cores e logo depois o Gerente
muda no painel (Personalização).

Confira: `docker compose exec postgres psql -U sysjb_migrator -d sysjb -c "SELECT slug, domain, active FROM tenants;"`

---

## 8. Criar o Gerente da banca

```bash
cd /srv/sysjb
pnpm operator:create --tenant minhabanca --name "Nome do Gerente" --email gerente@minhabanca.com.br --role MANAGER
```

A senha gerada aparece **uma única vez** no terminal. Guarde no cofre de senhas. Outros operadores (Financeiro,
Suporte) o Gerente cadastra pelo painel, em Administração > Operadores.

---

## 9. Rodar API e web como serviço

Assim eles sobem sozinhos com a máquina e reiniciam se caírem.

**API** (`/etc/systemd/system/sysjb-api.service`):

```bash
sudo nano /etc/systemd/system/sysjb-api.service
```

```ini
[Unit]
Description=sys-jb API
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=deploy
WorkingDirectory=/srv/sysjb/apps/api
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file=/srv/sysjb/.env dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

**Web** (`/etc/systemd/system/sysjb-web.service`):

```bash
sudo nano /etc/systemd/system/sysjb-web.service
```

```ini
[Unit]
Description=sys-jb Web
After=network-online.target sysjb-api.service
Wants=network-online.target

[Service]
User=deploy
WorkingDirectory=/srv/sysjb/apps/web
Environment=NODE_ENV=production
EnvironmentFile=/srv/sysjb/.env
ExecStart=/srv/sysjb/apps/web/node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Ligar e conferir:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sysjb-api sysjb-web
systemctl status sysjb-api sysjb-web --no-pager
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/health   # 200
```

Logs ao vivo: `journalctl -u sysjb-api -f` e `journalctl -u sysjb-web -f`.

---

## 10. Nginx e HTTPS

Formato de log sem a query string (o webhook do cassino leva o token na URL e o aviso de pagamento leva a
assinatura; nada disso pode ir para o log):

```bash
echo "log_format sem_query '\$remote_addr - [\$time_local] \"\$request_method \$uri\" \$status \$body_bytes_sent';" | sudo tee /etc/nginx/conf.d/sysjb-log.conf
```

Configuração comum do proxy:

```bash
sudo nano /etc/nginx/snippets/sysjb-proxy.conf
```

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 60s;
```

Site (todos os domínios no mesmo arquivo; ao criar banca nova, acrescente o domínio em `server_name`):

```bash
sudo nano /etc/nginx/sites-available/sysjb
```

```nginx
# www -> sem www
server {
    listen 80;
    server_name www.minhabanca.com.br;
    return 301 https://minhabanca.com.br$request_uri;
}

server {
    listen 80;
    server_name minhabanca.com.br admin.meusistema.com.br;

    # Logo e imagens do mural (até 3 MB).
    client_max_body_size 5m;

    location = /integracoes/cassino {
        access_log /var/log/nginx/access.log sem_query;
        include snippets/sysjb-proxy.conf;
    }

    location ^~ /integracoes/pagamentos/ {
        access_log /var/log/nginx/access.log sem_query;
        include snippets/sysjb-proxy.conf;
    }

    location / {
        include snippets/sysjb-proxy.conf;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sysjb /etc/nginx/sites-enabled/sysjb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# HTTPS (o Certbot ajusta o arquivo e renova sozinho)
sudo certbot --nginx -d minhabanca.com.br -d www.minhabanca.com.br -d admin.meusistema.com.br
```

Teste no navegador:

- `https://minhabanca.com.br` → tela da banca (cadastro e login de jogador)
- `https://admin.meusistema.com.br` → login do painel; entre com o Gerente do passo 8

---

## 11. Integrações externas

**PlayFivers (cassino)**

1. No painel do PlayFivers, libere o **IPv4 da VPS** (`203.0.113.10`).
2. Cadastre o webhook: `https://minhabanca.com.br/integracoes/cassino?token=VALOR_DO_CASINO_WEBHOOK_TOKEN` (o valor
   está no `.env`).
3. Descubra os IPs de onde o PlayFivers chama: abra um jogo, faça uma rodada e veja o IP registrado no log do web
   (linhas `[cassino] webhook de <IP> aceito sem CASINO_WEBHOOK_IPS configurado`):
   `journalctl -u sysjb-web | grep "webhook de"`. Preencha `CASINO_WEBHOOK_IPS` no `.env` com esses IPs (separados
   por vírgula) e reinicie: `sudo systemctl restart sysjb-web`.

**MisticPay (Pix)**

1. No painel, como Gerente: **Configurações > Pagamentos**, cadastre as credenciais, clique em **Testar conexão** e
   ative o gateway.
2. Faça uma recarga de **R$ 1,00** e confira que caiu na carteira.
3. Como no cassino, veja o IP do aviso de pagamento no log do web (`journalctl -u sysjb-web | grep "webhook de"`) e
   preencha `PAYMENTS_WEBHOOK_IPS`. **Em produção, essa lista é obrigatória.**
4. Teste um saque pequeno.

**Loteria Integrada**

1. Libere o IPv4 da VPS no painel do provedor.
2. Cadastre o webhook de resultados: `https://admin.meusistema.com.br/integracoes/resultados`, com o token igual ao
   `RESULTS_WEBHOOK_TOKEN` do `.env`.
3. Teste a consulta: `cd /srv/sysjb && pnpm results:fetch` (consome a cota do contrato).

---

## 12. Backup diário (obrigatório)

O banco guarda dinheiro de jogadores. Backup só no próprio servidor não serve: se a VPS sumir, ele vai junto.

**Script de backup:**

```bash
sudo mkdir -p /var/backups/sysjb && sudo chown deploy:deploy /var/backups/sysjb
nano /home/deploy/backup-sysjb.sh
```

```bash
#!/bin/sh
# Backup diário do banco: formato custom do pg_dump (compactado), 14 dias guardados no servidor.
set -eu
DEST=/var/backups/sysjb
FILE="$DEST/sysjb-$(date +%Y-%m-%d_%H%M).dump"
docker compose --project-directory /srv/sysjb exec -T postgres pg_dump -U postgres -d sysjb -Fc > "$FILE"
find "$DEST" -name 'sysjb-*.dump' -mtime +14 -delete
# Cópia para fora do servidor (configure o rclone antes; ver abaixo):
rclone copy "$FILE" backup:sysjb-backups/
```

```bash
chmod +x /home/deploy/backup-sysjb.sh
crontab -e
```

```
30 3 * * * /home/deploy/backup-sysjb.sh >> /home/deploy/backup.log 2>&1
```

**Cópia externa:** instale o rclone (`sudo apt install -y rclone`) e configure um destino chamado `backup`
(`rclone config`): Backblaze B2, AWS S3 ou similar. Use um destino com **criptografia** (`crypt` do rclone), porque o
backup tem CPF, telefone e saldo dos jogadores.

**Teste a restauração** (pelo menos uma vez, e depois de tempos em tempos), num banco à parte:

```bash
cd /srv/sysjb
docker compose exec postgres createdb -U postgres sysjb_restore_teste
docker compose exec -T postgres pg_restore -U postgres -d sysjb_restore_teste --no-owner < /var/backups/sysjb/ARQUIVO.dump
docker compose exec postgres psql -U postgres -d sysjb_restore_teste -c "SELECT count(*) FROM users;"
docker compose exec postgres dropdb -U postgres sysjb_restore_teste
```

---

## 13. Checklist final

- [ ] `https://minhabanca.com.br` abre, cadastro e login de jogador funcionam
- [ ] `https://admin.meusistema.com.br` abre e o Gerente entra
- [ ] Recarga Pix de R$ 1,00 cai na carteira
- [ ] Saque pequeno é pago
- [ ] Um jogo do cassino abre e a rodada aparece no extrato
- [ ] Um resultado chega pelo webhook (Resultados no app)
- [ ] `CASINO_WEBHOOK_IPS` e `PAYMENTS_WEBHOOK_IPS` preenchidos
- [ ] Backup rodou (`ls /var/backups/sysjb`) e a cópia externa chegou
- [ ] Restauração testada
- [ ] `.env` guardado no cofre de senhas
- [ ] Alerta de disco (70% e 85%) configurado no painel do provedor ou num monitor (Uptime Kuma, Netdata)
- [ ] Monitor de disponibilidade apontando para `https://minhabanca.com.br` (Uptime Kuma, UptimeRobot)

---

## Atualizar para uma versão nova

```bash
cd /srv/sysjb
/home/deploy/backup-sysjb.sh            # 1. backup antes de qualquer coisa
git pull                                # 2. código novo
pnpm install --frozen-lockfile          # 3. dependências
pnpm build                              # 4. compila
pnpm db:migrate                         # 5. migrations novas (se houver)
sudo systemctl restart sysjb-api sysjb-web
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/health
```

O sistema fica fora do ar só durante o restart (alguns segundos). Faça em horário de pouco movimento e longe dos
horários de sorteio.

Se a versão nova der problema: `git checkout <commit anterior>`, `pnpm install --frozen-lockfile && pnpm build`,
`sudo systemctl restart sysjb-api sysjb-web`. Migrations não voltam sozinhas: se a nova tiver alterado o banco,
restaure o backup do passo 1.

## Adicionar outra banca

1. DNS: registros A do domínio novo (e do `www`) para o IP da VPS.
2. Criar a banca no banco (passo 7) e o Gerente dela (passo 8).
3. `.env`: gere uma chave (`openssl rand -hex 24`) e acrescente `slugnovo=CHAVE` em `TENANT_SERVICE_KEYS` e
   `dominionovo.com.br=CHAVE` em `WEB_SERVICE_KEYS`.
4. Nginx: acrescente o domínio em `server_name` (e o bloco do `www`), `sudo nginx -t && sudo systemctl reload nginx`,
   e rode o Certbot com o domínio novo.
5. `sudo systemctl restart sysjb-api sysjb-web`.

Não precisa compilar de novo. Só mudar `WEB_ADMIN_HOSTNAME` exige rodar `pnpm build` de novo.

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Página "Banca não encontrada" / 404 em tudo | Domínio diferente do cadastrado em `tenants.domain`, ou faltando em `WEB_SERVICE_KEYS` | Conferir o passo 7 e o `.env`; reiniciar os serviços |
| Painel não abre no `admin.` | `WEB_ADMIN_HOSTNAME` errado ou web compilado antes de ajustar | Corrigir o `.env` e rodar `pnpm build` + restart |
| Cassino: "Não foi possível abrir o jogo" | IP da VPS não liberado no PlayFivers (403) | Liberar o IPv4 no painel do PlayFivers |
| Rodadas do cassino não chegam | `CASINO_WEBHOOK_IPS` sem o IP certo (403 no log do web) ou token errado na URL | Ver `journalctl -u sysjb-web` e ajustar |
| Recarga paga não cai | Aviso do gateway barrado por `PAYMENTS_WEBHOOK_IPS` (sem o aviso, o sistema não sabe quem pagou) | Ver o log do web e corrigir a lista. As recargas afetadas vão para análise em 15 min: o Gerente libera em Carteira > Depósitos |
| Limite por IP bloqueando todo mundo | `WEB_TRUSTED_PROXY_HOPS` errado (todos parecem ter o mesmo IP) | 1 com só Nginx; 2 com Cloudflare na frente |
| API não sobe | Erro de configuração no `.env` (a API valida tudo ao iniciar) | `journalctl -u sysjb-api -n 50` mostra qual variável |
| Disco cheio | Logs ou backups locais | Ver "Logs e espaço em disco" no `HOSPEDAGEM.md`. **Nunca** apague arquivos de dentro do volume do PostgreSQL |

Comandos úteis:

```bash
systemctl status sysjb-api sysjb-web          # situação dos serviços
journalctl -u sysjb-api -n 100 --no-pager     # últimas linhas do log da API
docker compose -f /srv/sysjb/docker-compose.yml ps   # banco
df -h                                         # espaço em disco
```
