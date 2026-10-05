# Hospedagem

Recomendação de servidor para colocar o sistema em produção, e o que montar nele.

## Resumo

Uma **VPS no Brasil (São Paulo), com IPv4 fixo, 4 vCPU, 8 GB de RAM e 80 a 160 GB de SSD NVMe**.

O sistema tem três peças, que cabem na mesma máquina:

- **Web**: Next.js (app dos jogadores e painel administrativo)
- **API**: NestJS
- **Banco**: PostgreSQL 17 (via `docker-compose.yml`)

Não há Redis, fila nem armazenamento externo. Node.js 20.19 ou superior.

## Configuração

| | Mínimo (testes, poucas bancas) | Recomendado (produção) |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disco | 50 GB SSD | 80–160 GB NVMe |
| Sistema | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |

O que mais consome é o PostgreSQL (carteiras, rodadas do cassino, extratos) e a compilação do web no deploy, que sozinha usa 1 a 2 GB de RAM. Com 4 GB fica justo; 8 GB dá folga.

## Requisitos deste projeto

1. **Datacenter em São Paulo.** Os jogadores estão no Brasil. Um servidor na Europa ou nos EUA adiciona de 120 a 200 ms em cada clique e em cada rodada do cassino.
2. **IPv4 fixo e dedicado.** O PlayFivers e a Loteria Integrada liberam o acesso pelo IP do servidor. Se o IP mudar, o cassino e os resultados param. A API já sai por IPv4 (`apps/api/src/main.ts`).
3. **O provedor precisa aceitar apostas.** Muitos provedores (DigitalOcean, Hetzner, Hostinger e outros) proíbem conteúdo de apostas nos termos de uso e podem suspender o servidor sem aviso. Antes de contratar, pergunte por escrito se aceitam iGaming ou loterias.
4. **Domínios das bancas.** Cada banca tem o próprio domínio, mais o `admin.` do painel. O Caddy emite e renova o HTTPS de cada domínio sozinho; o Nginx com Certbot também serve.

## Onde contratar

Opções com datacenter em São Paulo:

| Provedor | Pontos fortes | Atenção |
|---|---|---|
| AWS Lightsail ou EC2 (sa-east-1) | Estável, IP fixo (Elastic IP), backups fáceis | Mais caro |
| Vultr (São Paulo) | Bom custo, IPv4 fixo, painel simples | Confirmar aceite de apostas |
| Magalu Cloud | Empresa brasileira, cobra em reais, emite nota fiscal | Confirmar aceite de apostas |
| Oracle Cloud (São Paulo) | Barata | Suporte fraco |
| Hospedagens especializadas em iGaming ("offshore") | Aceitam apostas explicitamente | Muitas sem servidor no Brasil |

Os preços mudam com frequência; confira no site de cada uma. Como referência, 4 vCPU e 8 GB costumam custar algo entre US$ 40 e US$ 100 por mês em São Paulo.

## O que montar no servidor

- **Nginx ou Caddy na frente**: HTTPS, encaminhamento do IP real (`WEB_TRUSTED_PROXY_HOPS`) e o log sem `?token=` na rota do webhook do cassino (configuração pronta na seção Cassino do README).
- **PostgreSQL** pelo `docker-compose.yml` do projeto, escutando só em `127.0.0.1`.
- **Web e API** rodando como serviço (systemd ou PM2): web só em `127.0.0.1:3000`, API só em `127.0.0.1:4000`, nunca expostos direto.
- **`.env` de produção** gerado com `pnpm setup:env` (não copiar o de desenvolvimento), legível só pelo usuário que roda a aplicação (`chmod 600 .env`), fora de imagens Docker e de backups abertos.
- **Backup diário do banco** (`pg_dump`) enviado para fora do servidor (bucket S3, Backblaze ou similar). O banco guarda dinheiro: isso é obrigatório.
- **Firewall** liberando só as portas 22 (SSH com chave), 80 e 443.
- **Cloudflare** (opcional): proteção contra ataques e cache. Nesse caso use `WEB_TRUSTED_PROXY_HOPS=2`. O webhook do PlayFivers vai chegar pelos IPs da Cloudflare, então ajuste `CASINO_WEBHOOK_IPS`.

## Logs e espaço em disco

Logs sem limite enchem o disco mais rápido que o banco. Com o disco cheio, o PostgreSQL para de gravar e o sistema para (o dinheiro não se corrompe: cada operação é uma transação única).

**Já resolvido no projeto:**

- **Log do container do PostgreSQL** limitado no `docker-compose.yml`: até 3 arquivos de 10 MB.
- **Limpeza diária automática** na API (função `maintenance_purge` no banco): sessões de jogador e de operador encerradas há mais de 7 dias, tentativas de login com mais de 1 dia e consultas ao provedor de resultados com mais de 90 dias. Roda ao subir a API e a cada 24 h, e o resultado aparece no log (`[Maintenance] limpeza: ...`). Dinheiro, prêmios, rodadas do cassino e auditoria nunca são apagados.

**A configurar no servidor:**

1. **Docker (padrão para qualquer container):** em `/etc/docker/daemon.json`

   ```json
   { "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
   ```

   Depois: `sudo systemctl restart docker`. Vale para containers criados a partir daí.

2. **journald (logs do sistema e dos serviços systemd do web e da API):** em `/etc/systemd/journald.conf`

   ```ini
   [Journal]
   SystemMaxUse=500M
   MaxRetentionSec=1month
   ```

   Depois: `sudo systemctl restart systemd-journald`. Para liberar espaço na hora: `sudo journalctl --vacuum-size=200M`.

3. **Nginx:** o Ubuntu já instala a rotação em `/etc/logrotate.d/nginx`. Confira que está diária, com compressão e poucos dias guardados:

   ```
   /var/log/nginx/*.log {
       daily
       rotate 14
       compress
       delaycompress
       missingok
       notifempty
       sharedscripts
       postrotate
           [ -s /run/nginx.pid ] && kill -USR1 `cat /run/nginx.pid`
       endscript
   }
   ```

   Teste com `sudo logrotate -d /etc/logrotate.d/nginx`. Com Caddy, use `roll_size 10mb` e `roll_keep 5` no bloco `log`.

4. **PM2** (se usar no lugar do systemd): `pm2 install pm2-logrotate` (padrão: 10 MB por arquivo, 30 arquivos).

**Monitoramento:** alerta de disco em 70% e 85% (painel do provedor, Netdata ou Uptime Kuma), e o banco num volume separado, que pode ser aumentado em minutos.

**Se encher mesmo assim:** liberar logs antigos (`journalctl --vacuum-size=200M`, logs do Docker e do Nginx), backups locais e imagens Docker antigas (`docker system prune`); depois aumentar o volume. **Nunca** apagar arquivos de dentro da pasta de dados do PostgreSQL (`pg_wal` e outras): isso corrompe o banco.

## Integrações externas

- **PlayFivers**: liberar o IPv4 do servidor no painel; cadastrar o webhook `https://<domínio>/integracoes/cassino?token=<CASINO_WEBHOOK_TOKEN>`; preencher `CASINO_WEBHOOK_IPS` com os IPs de onde o PlayFivers envia os webhooks.
- **Loteria Integrada** (resultados, horóscopo, atrasados): liberar o IPv4 do servidor e cadastrar o webhook de resultados (`/integracoes/resultados`).
- **Credenciais**: gerar token e secret novos no PlayFivers para produção (os atuais foram compartilhados em conversa).

## Antes de hospedar

O sistema opera loterias, fazendinha e cassino com dinheiro real. No Brasil, apostas de quota fixa e cassino online exigem autorização do Ministério da Fazenda (Lei 14.790/2023), e o jogo do bicho continua sendo contravenção penal. Isso afeta quais provedores aceitam hospedar e quais meios de pagamento (Pix) aceitam operar. Confirme o enquadramento com um advogado da área antes do lançamento.
