# Deploy na VPS (passo a passo)

Como colocar o sistema no ar numa VPS Ubuntu 24.04, com a Cloudflare na frente, do zero até a primeira banca
funcionando. Para escolher a VPS (tamanho, provedor, região), veja `HOSPEDAGEM.md`.

**Como fica:**

```
Jogador ──HTTPS──▶ Cloudflare ──HTTPS 443 (só IPs da Cloudflare)──▶ Nginx ──▶ Web Next.js (127.0.0.1:3000)
                                                                              ──▶ API NestJS (127.0.0.1:4000)
                                                                              ──▶ PostgreSQL (Docker, 127.0.0.1:5433)
```

- A Cloudflare recebe todo o tráfego e segura ataques (DDoS). O IP da VPS não aparece no DNS.
- O firewall da VPS só aceita HTTPS vindo da Cloudflare. Quem tentar o IP da VPS direto não conecta.
- O Nginx troca o IP da Cloudflare pelo IP real do visitante (cabeçalho `CF-Connecting-IP`). É desse IP que dependem o
  limite de requisições e as listas de IPs dos webhooks (`CASINO_WEBHOOK_IPS`, `PAYMENTS_WEBHOOK_IPS`).
- Web, API e banco escutam apenas em `127.0.0.1`.
- O que a VPS chama para fora (PlayFivers, Loteria Integrada, MisticPay) sai direto pelo IP dela, sem passar pela
  Cloudflare. As liberações de IP nesses painéis usam o IP da VPS.

**Nos exemplos, troque:**

| Exemplo | Troque por |
|---|---|
| `minhabanca.com.br` | domínio da banca (o app dos jogadores) |
| `meusistema.com.br` | domínio do sistema, onde fica o painel |
| `admin.meusistema.com.br` | endereço do painel administrativo (um só para todas as bancas) |
| `minhabanca` | slug da banca (minúsculas, números e hífen) |
| `203.0.113.10` | IPv4 da VPS |
| `deploy` | usuário que vai rodar o sistema |

---

## 0. Antes de começar

- [ ] **Código salvo no git** (repositório privado no GitHub, GitLab etc.). O servidor vai baixar o código de lá.
- [ ] **VPS contratada**: Ubuntu 24.04, São Paulo, IPv4 fixo, 4 vCPU / 8 GB (ver `HOSPEDAGEM.md`).
- [ ] **Domínios registrados** (Registro.br ou outro) e acesso ao painel onde eles foram comprados.
- [ ] **Conta na Cloudflare** (plano Free basta), com verificação em duas etapas ligada.
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

Firewall e atualizações automáticas de segurança. Por enquanto só o SSH fica aberto. O HTTPS é liberado no passo 11,
e só para a Cloudflare:

```bash
sudo ufw allow OpenSSH
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

## 2. Cloudflare: domínios, DNS e segurança

Faça isso cedo: a troca de DNS pode levar algumas horas para valer, e dá para seguir com os passos 3 a 10 enquanto
isso. **Repita para cada domínio** (o da banca e o `meusistema.com.br` do painel). Cada domínio é um "site" separado
na Cloudflare.

**2.1. Adicionar o domínio.** No painel da Cloudflare: *Add a domain* → digite `minhabanca.com.br` → plano **Free**.
A Cloudflare mostra dois servidores de nome (ex.: `ana.ns.cloudflare.com` e `bob.ns.cloudflare.com`). No painel onde
o domínio foi registrado (no Registro.br: *domínio > DNS > Alterar servidores DNS*), troque os servidores pelos dois da
Cloudflare. Espere o domínio aparecer como **Active** na Cloudflare.

**2.2. Registros DNS** (*DNS > Records*), todos com a nuvem **laranja** (*Proxied*):

| Domínio | Tipo | Nome | Conteúdo |
|---|---|---|---|
| `minhabanca.com.br` | A | `@` | `203.0.113.10` |
| `minhabanca.com.br` | A | `www` | `203.0.113.10` |
| `meusistema.com.br` | A | `admin` | `203.0.113.10` |

> **Nunca** crie registro com nuvem cinza (*DNS only*) apontando para a VPS (ex.: `ssh.`, `ftp.`, `mail.`). Ele
> mostra o IP da VPS para qualquer um e anula a proteção. Para o SSH, use o IP direto.

**2.3. SSL/TLS:**

- *SSL/TLS > Overview*: modo **Full (strict)**. (*Flexible* causa "muitos redirecionamentos"; *Full* sem *strict*
  aceita qualquer certificado na VPS.)
- *SSL/TLS > Edge Certificates*: **Always Use HTTPS** ligado, **Minimum TLS Version** 1.2.

**2.4. Segurança (para os webhooks passarem):** PlayFivers, MisticPay e Loteria Integrada chamam o sistema de servidor
para servidor e não resolvem desafios de navegador.

- *Security > Bots*: **Bot Fight Mode desligado**. No plano Free ele não aceita exceção e bloqueia os webhooks.
- *Security > WAF > Custom rules > Create rule*:
  - Nome: `Webhooks`
  - Expressão (*Edit expression*): `(starts_with(http.request.uri.path, "/integracoes/"))`
  - Ação: **Skip**, marcando todas as opções de pular que aparecerem (regras personalizadas restantes, rate limiting,
    regras gerenciadas, Browser Integrity Check, Security Level).
  - Deixe essa regra em primeiro lugar.

**2.5. Desempenho e página:**

- *Speed > Optimization*: **Rocket Loader desligado**.
- *Scrape Shield*: **Email Address Obfuscation desligado**.

  Os dois alteram os scripts no caminho, e a CSP do site bloqueia script alterado: a página aparece, mas nenhum
  botão funciona (o login do painel só recarrega a tela). Vale **também para o domínio do painel**. Depois de
  desligar, *Caching > Purge Everything* e teste numa aba anônima.
- *Caching*: deixe o padrão. A Cloudflare guarda só arquivos estáticos (`/_next/static`, imagens). **Não** crie regra
  *Cache Everything*: as páginas mudam por banca e por login.

Confira (depois de *Active*): `nslookup minhabanca.com.br` responde IPs da **Cloudflare** (ex.: `104.21.x.x`,
`172.67.x.x`), não o da VPS. Isso é o esperado.

---

## 3. Instalar Docker, Node.js, pnpm e Nginx

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

**Nginx** (o HTTPS usa o certificado de origem da Cloudflare, então não precisa de Certbot):

```bash
sudo apt install -y nginx
```

**Limite dos logs do sistema** (journald guarda os logs da API e do web):

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\nMaxRetentionSec=1month\n' | sudo tee /etc/systemd/journald.conf.d/sysjb.conf
sudo systemctl restart systemd-journald
```

---

## 4. Baixar o código

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

## 5. Configurar o `.env` de produção

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
WEB_TRUSTED_PROXY_HOPS=1
```

É `1` mesmo com a Cloudflare: o Nginx (passo 11) já entrega ao web só o IP real do visitante. **Não use `2`.**

**Cassino (PlayFivers):**

```ini
PLAYFIVERS_AGENT_TOKEN=...
PLAYFIVERS_SECRET_KEY=...
PLAYFIVERS_AGENT_CODE=...
PLAYFIVERS_WALLETS=Carteira Oficial (Slots)
CASINO_WEBHOOK_IPS=          # deixe vazio por enquanto; preencha no passo 12
```

**Pagamentos:**

```ini
PAYMENTS_WEBHOOK_IPS=        # deixe vazio por enquanto; preencha no passo 12
```

As credenciais da MisticPay **não vão no `.env`**: o Gerente cadastra no painel (passo 12).

**Loteria Integrada:** `RESULTS_API_TOKEN`, `HOROSCOPE_API_TOKEN`, `OVERDUE_API_TOKEN` (e `RESULTS_API_MONTHLY_QUOTA`
com a cota do seu contrato).

**Notificações:** `WEB_PUSH_SUBJECT=mailto:seu-email@dominio.com.br`.

> **Guarde uma cópia do `.env` num cofre de senhas** (Bitwarden, 1Password). Sem ele não dá para restaurar o sistema:
> as senhas do banco e a `PAYMENTS_SECRET_KEY` (que decifra as credenciais do gateway) estão nele. Depois que o banco
> for criado (passo 6), **não troque** as senhas `SYSJB_*` nem rode o gerador com `--force`.

---

## 6. Subir o banco de dados

```bash
cd /srv/sysjb
pnpm db:up
docker ps    # postgres "healthy", porta 127.0.0.1:5433
```

O primeiro start cria as roles `sysjb_migrator` (dona das tabelas) e `sysjb_app` (usada pela API, sem acesso de
administrador) e os bancos `sysjb` e `sysjb_test`. Os dados ficam no volume Docker `sysjb_pgdata`.

---

## 7. Instalar dependências, compilar e migrar

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

## 8. Criar a banca

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

## 9. Criar o Gerente da banca

```bash
cd /srv/sysjb
pnpm operator:create --tenant minhabanca --name "Nome do Gerente" --email gerente@minhabanca.com.br --role MANAGER
```

A senha gerada aparece **uma única vez** no terminal. Guarde no cofre de senhas. Outros operadores (Financeiro,
Suporte) o Gerente cadastra pelo painel, em Administração > Operadores.

---

## 10. Rodar API e web como serviço

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

## 11. Nginx, certificado e firewall

### 11.1. Faixas de IP da Cloudflare

Um script faz duas coisas com a lista oficial de IPs da Cloudflare:

- ensina o Nginx a confiar no `CF-Connecting-IP` só quando a conexão vem da Cloudflare;
- libera a porta 443 no firewall só para esses IPs.

```bash
sudo nano /usr/local/sbin/cloudflare-ips.sh
```

```sh
#!/bin/sh
# Faixas de IP da Cloudflare: Nginx (IP real do visitante) e firewall (443 só a partir da Cloudflare).
# Rodar como root. Pode rodar de novo a qualquer momento: regras já existentes são ignoradas pelo ufw.
set -eu
V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
[ -n "$V4" ] && [ -n "$V6" ] || { echo "lista da Cloudflare vazia" >&2; exit 1; }

CONF=/etc/nginx/conf.d/cloudflare-realip.conf
{
  echo "# Gerado por /usr/local/sbin/cloudflare-ips.sh. Não edite à mão."
  for ip in $V4 $V6; do echo "set_real_ip_from $ip;"; done
  echo "real_ip_header CF-Connecting-IP;"
} > "$CONF.novo"
mv "$CONF.novo" "$CONF"
nginx -t && systemctl reload nginx

for ip in $V4 $V6; do
  ufw allow proto tcp from "$ip" to any port 443 comment cloudflare > /dev/null
done
echo "ok: $(echo $V4 $V6 | wc -w) faixas"
```

```bash
sudo chmod 700 /usr/local/sbin/cloudflare-ips.sh
sudo /usr/local/sbin/cloudflare-ips.sh
sudo ufw status | grep -c cloudflare    # algumas dezenas de regras
```

A lista muda raramente. Para manter em dia, rode uma vez por mês pelo cron do root (`sudo crontab -e`):

```
0 4 1 * * /usr/local/sbin/cloudflare-ips.sh > /dev/null
```

### 11.2. Certificado de origem (um por domínio)

É o certificado que a Cloudflare usa para falar com a VPS. Vale por 15 anos e não precisa renovar. Para **cada
domínio** (o da banca e o `meusistema.com.br`):

1. Na Cloudflare, no domínio: *SSL/TLS > Origin Server > Create Certificate*.
2. Tipo **RSA**, nomes `minhabanca.com.br` e `*.minhabanca.com.br`, validade **15 anos**.
3. A chave privada aparece **uma única vez**. Copie as duas partes para a VPS:

```bash
sudo mkdir -p /etc/ssl/cloudflare && sudo chmod 700 /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/minhabanca.com.br.pem    # cole o "Origin Certificate"
sudo nano /etc/ssl/cloudflare/minhabanca.com.br.key    # cole a "Private Key"
sudo chmod 600 /etc/ssl/cloudflare/*.key
```

Repita com `meusistema.com.br` (o `*.meusistema.com.br` cobre o `admin.`).

### 11.3. Configuração do Nginx

Formato de log sem a query string (o webhook do cassino leva o token na URL e o aviso de pagamento leva a
assinatura; nada disso pode ir para o log):

```bash
echo "log_format sem_query '\$remote_addr - [\$time_local] \"\$request_method \$uri\" \$status \$body_bytes_sent';" | sudo tee /etc/nginx/conf.d/sysjb-log.conf
```

Encaminhamento para o web:

```bash
sudo nano /etc/nginx/snippets/sysjb-proxy.conf
```

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
# $remote_addr já é o IP real do visitante (cloudflare-realip.conf). Substitui o X-Forwarded-For em vez de
# acrescentar: o que o visitante mandar nesse cabeçalho é descartado e não dá para forjar outro IP.
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 60s;
```

O que é igual em todos os domínios:

```bash
sudo nano /etc/nginx/snippets/sysjb-app.conf
```

```nginx
# Logo e imagens do mural (até 3 MB).
client_max_body_size 5m;

# Webhooks (cassino, pagamentos, resultados): log sem a query string.
location ^~ /integracoes/ {
    access_log /var/log/nginx/access.log sem_query;
    include snippets/sysjb-proxy.conf;
}

location / {
    include snippets/sysjb-proxy.conf;
}
```

O site, com um bloco por domínio. Ao criar banca nova, acrescente os dois blocos dela.

```bash
sudo nano /etc/nginx/sites-available/sysjb
```

```nginx
# Domínio que não é de nenhuma banca: recusa a conexão.
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
}

# ---- minhabanca.com.br ----
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.minhabanca.com.br;
    ssl_certificate     /etc/ssl/cloudflare/minhabanca.com.br.pem;
    ssl_certificate_key /etc/ssl/cloudflare/minhabanca.com.br.key;
    return 301 https://minhabanca.com.br$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name minhabanca.com.br;
    ssl_certificate     /etc/ssl/cloudflare/minhabanca.com.br.pem;
    ssl_certificate_key /etc/ssl/cloudflare/minhabanca.com.br.key;
    include snippets/sysjb-app.conf;
}

# ---- painel ----
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name admin.meusistema.com.br;
    ssl_certificate     /etc/ssl/cloudflare/meusistema.com.br.pem;
    ssl_certificate_key /etc/ssl/cloudflare/meusistema.com.br.key;
    include snippets/sysjb-app.conf;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/sysjb /etc/nginx/sites-enabled/sysjb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Não há bloco na porta 80: a Cloudflare já redireciona para HTTPS (*Always Use HTTPS*) e só fala com a VPS pela 443.

### 11.4. Testes

No navegador:

- `https://minhabanca.com.br` → tela da banca (cadastro e login de jogador)
- `https://admin.meusistema.com.br` → login do painel; entre com o Gerente do passo 9

No **seu computador**:

```bash
curl -sI https://minhabanca.com.br | grep -i cf-ray        # tem cf-ray: passou pela Cloudflare
curl -m 10 -k https://203.0.113.10                          # precisa dar timeout: VPS fechada para fora
```

Na VPS, depois de abrir o site: `sudo tail -n 5 /var/log/nginx/access.log` precisa mostrar o **seu** IP (veja em
qualquer site de "qual meu IP"), e não um IP da Cloudflare (`104.x`, `172.64.x` a `172.71.x`, `162.158.x`,
`141.101.x`, `108.162.x`…). Se aparecer IP da Cloudflare, o `cloudflare-realip.conf` não foi carregado: rode o
script do 11.1 de novo e confira `sudo nginx -T | grep real_ip_header`.

---

## 12. Integrações externas

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
2. Cadastre o webhook de resultados: *URL Receptor* `https://admin.meusistema.com.br/integracoes/resultados` e, no
   campo *Bearer Token*, o **mesmo valor** do `RESULTS_WEBHOOK_TOKEN` do `.env` (24 a 32 caracteres; o token que o
   painel deles sugere é curto demais para a API). Valor diferente = `401 Token ausente ou inválido` no log deles.
   Esse campo é **também a chave da consulta**: `RESULTS_API_TOKEN` recebe o mesmo valor (senão a consulta dá
   `401 Token invalido`). Trocou no painel deles, troque as duas no `.env` e reinicie a API.
3. Teste a consulta (`RESULTS_API_TOKEN`), gastando uma consulta só:
   `cd /srv/sysjb && pnpm results:fetch --lottery rj --extraction 11` (`--lottery all` consulta todas as siglas e
   gasta mais da cota).

> **Nunca coloque IPs da Cloudflare** em `CASINO_WEBHOOK_IPS` ou `PAYMENTS_WEBHOOK_IPS`. Isso liberaria qualquer pessoa
> que passe pela Cloudflare. Se o log mostrar um IP da Cloudflare como origem do webhook, o problema está no 11.1.
>
> Se um webhook não chega e nada aparece no log do web, a Cloudflare barrou antes: veja *Security > Events* no painel
> dela e confira o passo 2.4.

---

## 13. Backup diário (obrigatório)

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
(`rclone config`): Cloudflare R2, Backblaze B2, AWS S3 ou similar. Use um destino com **criptografia** (`crypt` do
rclone), porque o backup tem CPF, telefone e saldo dos jogadores.

**Teste a restauração** (pelo menos uma vez, e depois de tempos em tempos), num banco à parte:

```bash
cd /srv/sysjb
docker compose exec postgres createdb -U postgres sysjb_restore_teste
docker compose exec -T postgres pg_restore -U postgres -d sysjb_restore_teste --no-owner < /var/backups/sysjb/ARQUIVO.dump
docker compose exec postgres psql -U postgres -d sysjb_restore_teste -c "SELECT count(*) FROM users;"
docker compose exec postgres dropdb -U postgres sysjb_restore_teste
```

---

## 14. Checklist final

- [ ] `https://minhabanca.com.br` abre, cadastro e login de jogador funcionam
- [ ] `https://admin.meusistema.com.br` abre e o Gerente entra
- [ ] Acesso direto ao IP da VPS (`https://203.0.113.10`) dá timeout
- [ ] Log do Nginx mostra o IP real do visitante, não da Cloudflare
- [ ] Recarga Pix de R$ 1,00 cai na carteira
- [ ] Saque pequeno é pago
- [ ] Um jogo do cassino abre e a rodada aparece no extrato
- [ ] Um resultado chega pelo webhook (Resultados no app)
- [ ] `CASINO_WEBHOOK_IPS` e `PAYMENTS_WEBHOOK_IPS` preenchidos (sem IPs da Cloudflare)
- [ ] Backup rodou (`ls /var/backups/sysjb`) e a cópia externa chegou
- [ ] Restauração testada
- [ ] `.env` e as chaves dos certificados de origem guardados no cofre de senhas
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

1. **Cloudflare:** adicione o domínio novo e faça o passo 2 inteiro nele (servidores de nome, registros `@` e `www`
   laranja, Full (strict), Bot Fight Mode desligado, regra `Webhooks`, Rocket Loader e Email Obfuscation desligados).
2. **Certificado de origem** do domínio novo (passo 11.2).
3. Criar a banca no banco (passo 8) e o Gerente dela (passo 9).
4. `.env`: gere uma chave (`openssl rand -hex 24`) e acrescente `slugnovo=CHAVE` em `TENANT_SERVICE_KEYS` e
   `dominionovo.com.br=CHAVE` em `WEB_SERVICE_KEYS`.
5. Nginx: copie os dois blocos de `minhabanca.com.br` em `/etc/nginx/sites-available/sysjb`, troque o domínio e os
   arquivos do certificado, e `sudo nginx -t && sudo systemctl reload nginx`.
6. `sudo systemctl restart sysjb-api sysjb-web`.

Não precisa compilar de novo. Só mudar `WEB_ADMIN_HOSTNAME` exige rodar `pnpm build` de novo.

## Durante um ataque

Se o site ficar lento ou cair por excesso de acessos, ligue *Overview > Under Attack Mode* no domínio afetado. Ele
mostra um desafio a cada visitante e **bloqueia os webhooks**. Para os webhooks passarem, crie em *Rules >
Configuration Rules* uma regra para `starts_with(http.request.uri.path, "/integracoes/")` com **Security Level**
diferente de *I'm Under Attack*. Desligue o modo quando o ataque passar. Recargas cujo aviso não chegou nesse período
vão para análise em 15 min (Carteira > Depósitos).

---

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Erro **521** da Cloudflare | Nginx parado | `sudo systemctl status nginx` |
| Erro **522** | Firewall barrando a Cloudflare, ou VPS fora do ar | `sudo ufw status` precisa listar as faixas `cloudflare` na 443; rodar `sudo /usr/local/sbin/cloudflare-ips.sh` |
| Erro **525** | Domínio sem bloco no Nginx (cai no `ssl_reject_handshake`) | Conferir `server_name` em `/etc/nginx/sites-available/sysjb` |
| Erro **526** | Certificado da VPS não é o de origem desse domínio | Refazer o passo 11.2 e conferir os caminhos no Nginx |
| Erro **502** | Web parado | `systemctl status sysjb-web`, `journalctl -u sysjb-web -n 50` |
| "Muitos redirecionamentos" | SSL/TLS da Cloudflare em *Flexible* | Trocar para **Full (strict)** |
| Tela quebrada, botões sem resposta; login (banca ou painel) só recarrega a página; F12 > Console mostra "violates the Content Security Policy" | Rocket Loader ou Email Obfuscation ligados naquele domínio | Desligar (passo 2.5), *Purge Everything* e testar em aba anônima |
| Página "Banca não encontrada" / 404 em tudo | Domínio diferente do cadastrado em `tenants.domain`, ou faltando em `WEB_SERVICE_KEYS` | Conferir o passo 8 e o `.env`; reiniciar os serviços |
| Painel não abre no `admin.` | `WEB_ADMIN_HOSTNAME` errado ou web compilado antes de ajustar | Corrigir o `.env` e rodar `pnpm build` + restart |
| Painel mostra "O painel administrativo não está disponível neste endereço" | Falta o par `admin.<domínio>=<ADMIN_SERVICE_KEY>` em `WEB_SERVICE_KEYS` (passo 5), ou `WEB_ADMIN_HOSTNAME` diferente do endereço | Corrigir o `.env` e reiniciar web e API (se mudou o `WEB_ADMIN_HOSTNAME`, `pnpm build` antes) |
| Login do painel: "Serviço indisponível" | `ADMIN_SERVICE_KEY` diferente do valor em `WEB_SERVICE_KEYS`, ou API não reiniciada depois de mudar o `.env` | Igualar as chaves; `sudo systemctl restart sysjb-api sysjb-web` |
| Cassino: "Não foi possível abrir o jogo" | IP da VPS não liberado no PlayFivers (403) | Liberar o IPv4 no painel do PlayFivers |
| Cassino: lobby "Nenhum jogo disponível no momento" | Catálogo não sincronizou (a API sincroniza ao iniciar e a cada 12 h; ex.: IP liberado no PlayFivers depois do start) | `sudo systemctl restart sysjb-api` e `journalctl -u sysjb-api \| grep "catálogo do cassino"` |
| Cassino: jogo abre mas diz "sem saldo" | Token da URL do webhook diferente do `CASINO_WEBHOOK_TOKEN`, ou API não reiniciada depois de trocar o token | Copiar o token do `.env` para a URL no PlayFivers; `sudo systemctl restart sysjb-api` |
| Rodadas do cassino não chegam, nada no log do web | Cloudflare barrando o webhook | *Security > Events* na Cloudflare; conferir o passo 2.4 |
| Rodadas do cassino não chegam, 403 no log do web | `CASINO_WEBHOOK_IPS` sem o IP certo, ou token errado na URL | Ver `journalctl -u sysjb-web` e ajustar |
| Recarga paga não cai | Aviso do gateway barrado na Cloudflare ou por `PAYMENTS_WEBHOOK_IPS` | Ver o log do web e o *Security > Events*. As recargas afetadas vão para análise em 15 min: o Gerente libera em Carteira > Depósitos |
| Limite por IP bloqueando todo mundo; log mostra IPs da Cloudflare | `cloudflare-realip.conf` ausente ou desatualizado, ou `WEB_TRUSTED_PROXY_HOPS` diferente de 1 | Rodar o script do 11.1 e conferir o `.env` |
| API não sobe | Erro de configuração no `.env` (a API valida tudo ao iniciar) | `journalctl -u sysjb-api -n 50` mostra qual variável |
| Disco cheio | Logs ou backups locais | Ver "Logs e espaço em disco" no `HOSPEDAGEM.md`. **Nunca** apague arquivos de dentro do volume do PostgreSQL |

Comandos úteis:

```bash
systemctl status nginx sysjb-api sysjb-web    # situação dos serviços
journalctl -u sysjb-api -n 100 --no-pager     # últimas linhas do log da API
docker compose -f /srv/sysjb/docker-compose.yml ps   # banco
sudo ufw status                               # firewall
df -h                                         # espaço em disco
```
