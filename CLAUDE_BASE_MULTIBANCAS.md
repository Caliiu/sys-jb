# Instruções para Claude — estrutura multi-banca e persistência de usuários

## Objetivo

Atue como desenvolvedor full-stack sênior e implemente a estrutura inicial de um SaaS multi-tenant com white label: várias bancas com marcas e domínios próprios dentro do mesmo sistema.

Nesta etapa, implemente somente a infraestrutura mínima e a base de cadastro, consulta e atualização de usuários, com carteira inicial zerada. Entregue código funcional, migrations e instruções para execução local. Não entregue apenas um plano.

Antes de alterar arquivos, leia as instruções do repositório e inspecione a estrutura existente. Preserve trabalho anterior. Se o projeto estiver vazio, crie a estrutura descrita abaixo. Resolva escolhas secundárias com bom senso e documente as decisões.

## Escopo e stack

- TypeScript em modo strict e pnpm workspaces.
- Next.js + Tailwind para uma interface mínima de cadastro e consulta.
- NestJS para a API REST, organizada como monólito modular.
- PostgreSQL como banco persistente.
- Prisma para schema, migrations e acesso ao banco; use migrations SQL para políticas RLS e constraints adicionais.
- Docker Compose para desenvolvimento local.
- Redis e BullMQ ficam previstos como evolução; não instale dependências nem crie filas sem uso nesta etapa.
- Escolha versões estáveis compatíveis no momento da implementação, confira a documentação oficial e fixe as dependências no lockfile.

Não implementar apostas, resultados, sorteios, pagamentos, depósitos, saques, bônus promocionais, movimentação de carteira, integrações externas ou aplicativos nativos. Não construir dashboards completos ou CRUD administrativo de bancas. Criar duas bancas fictícias via seed é suficiente.

## Organização sugerida

```text
apps/web                 # Next.js: interface mínima
apps/api                 # NestJS: tenants, users e persistência da carteira
packages/contracts      # Tipos e contratos públicos, sem dependências do servidor
packages/database       # Prisma, migrations e seed
docker-compose.yml
.env.example
README.md
```

## Contrato público de usuário — preservar nomes e formato

O objeto abaixo foi fornecido como referência de formato. Não utilize seus dados pessoais em seeds, testes ou logs. Use dados sintéticos nesses locais. O UUID e o displayId são exemplos, nunca constantes para novos cadastros.

```json
{
  "id": "af4f2ca5-b4c0-4072-897c-d0df999e4a2e",
  "name": "Victor Luiz Martins",
  "email": null,
  "phone": "63985333827",
  "document": "39218839039",
  "avatar": null,
  "displayId": 123901,
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

Preserve camelCase no JSON. Os campos nullable devem aparecer explicitamente como null, nunca ser omitidos. Não acrescentar tenantId, timestamps ou dados internos ao objeto público. Defina um mapper explícito, evitando retornar diretamente entidades do ORM.

## Modelo interno

### Tenant

- id: UUID.
- name e slug, com slug único.
- domain: hostname único para resolução da banca.
- logoUrl nullable, primaryColor e secondaryColor.
- active, createdAt e updatedAt.

### User

- id: UUID gerado no servidor.
- tenantId: vínculo obrigatório com Tenant.
- name: string obrigatória, trim, de 2 a 120 caracteres.
- email: string nullable; trim e normalização para minúsculas.
- phone: string obrigatória; normalizar para somente dígitos, 10 ou 11 dígitos no formato nacional brasileiro nesta fase.
- document: string obrigatória; normalizar para somente dígitos e exigir 11 dígitos nesta fase. Não apresentar a validação de formato como verificação de identidade ou validade fiscal.
- avatar: URL HTTP/HTTPS nullable; não implementar upload nem baixar a URL no servidor.
- displayId: inteiro positivo gerado por sequence/identity no PostgreSQL, com unicidade global. Não usar MAX + 1. Aceitar lacunas e garantir valor serializável como inteiro seguro em JSON.
- createdAt e updatedAt internos.

Telefone e documento devem permanecer strings, preservando zeros à esquerda. Criar unicidade por (tenantId, phone), (tenantId, document) e (tenantId, email). Vários emails nulos devem ser permitidos. O mesmo telefone, documento ou email pode existir em bancas diferentes como contas independentes.

### Wallet

- Uma carteira obrigatória por usuário, criada na mesma transação do cadastro.
- tenantId e userId; vínculo composto assegurando que carteira e usuário pertençam à mesma banca.
- Persistir os seis campos base: balanceJb, bonusJb, prizesJb, balanceGames, bonusGames e prizesGames.
- Usar inteiros em centavos, default zero, com constraint de não negatividade e limite compatível com Number.MAX_SAFE_INTEGER na serialização.
- Neste contrato inicial, todos os valores monetários numéricos representam centavos. Documentar isso no README e nos contratos.
- totalAvailableJb = balanceJb + bonusJb + prizesJb.
- totalAvailableGames = balanceGames + bonusGames + prizesGames.
- Calcular os dois totais na leitura, sem persistir cópias redundantes.
- withdrawable permanece 0 nesta fase. Não presumir que saldo ou prêmio possa ser sacado e não inventar regra de saque.
- Não disponibilizar endpoints de alteração de saldo. Todos os campos da carteira são somente leitura na API.

Os totais acima são uma convenção inicial de apresentação e não definem elegibilidade para apostas ou saques. Como esta fase não tem movimentações, todos os valores reais criados pela aplicação permanecem zerados.

### Promotor

O exemplo só define valores null e não informa a estrutura de um promotor. Nesta fase, retornar promoter, promoterName e promoterPhone como null. Não criar módulo, relacionamento ou formato não solicitado. Centralizar esses campos no contrato e no mapper para futura evolução.

## Isolamento entre bancas

- Resolver o tenant pelo hostname cadastrado, com allowlist exata e tratamento consistente da porta no desenvolvimento.
- Não aceitar tenantId arbitrário no corpo ou query string. Um header enviado pelo cliente não constitui autorização.
- Hostname desconhecido ou banca inativa deve falhar sem fallback para outra banca.
- Não confiar em X-Forwarded-Host fora de um proxy explicitamente confiável.
- Todos os acessos a User e Wallet devem ter escopo de tenant no serviço/repositório.
- Aplicar RLS no PostgreSQL como segunda camada; implementar USING e WITH CHECK para o tenant corrente.
- A conexão de runtime deve usar role sem superuser, sem BYPASSRLS e sem propriedade das tabelas protegidas. Separar credencial de migrations da credencial de runtime.
- Definir contexto do tenant com configuração local à transação, na mesma conexão de todas as consultas protegidas. Nunca usar estado global de conexão que possa vazar pelo pool.
- Sem contexto válido, negar acesso. Usar FORCE ROW LEVEL SECURITY quando apropriado e documentar as roles.
- Constraints e chaves estrangeiras compostas devem impedir relações entre usuários e carteiras de bancas distintas.

## Acesso nesta fase

Não inventar login de clientes, senha ou recuperação de conta: isso será uma etapa posterior. Para que os endpoints de dados pessoais não fiquem públicos, proteger a API de usuários com uma credencial de serviço por banca, definida por ambiente nesta base local.

- Associar a credencial à banca no servidor e confrontar com o tenant resolvido pelo hostname.
- O Next.js deve chamar a API somente no servidor; nunca enviar credenciais ao navegador nem usar NEXT_PUBLIC para segredos.
- A interface de demonstração deve rodar exclusivamente em desenvolvimento, vinculada ao localhost; desabilitar suas rotas de dados em produção enquanto não houver autenticação real.
- Documentar claramente que essa proteção é para integração/local e não substitui autenticação e autorização de clientes e administradores.
- Não publicar ou fazer deploy automaticamente.

## API mínima

| Método | Rota | Comportamento |
| --- | --- | --- |
| POST | /v1/users | Criar usuário e carteira zerada atomicamente; responder 201 com o contrato público |
| GET | /v1/users/:id | Consultar exclusivamente dentro da banca atual |
| PATCH | /v1/users/:id | Atualizar somente name, email, phone, document e avatar |
| GET | /health | Informar saúde básica sem expor segredos |

POST aceita somente name, email, phone, document e avatar. Name, phone e document são obrigatórios; os outros são opcionais/nullable. No PATCH, campo ausente mantém valor, null só limpa campos nullable. Rejeitar chaves desconhecidas e tentativas de enviar id, displayId, tenantId, wallet ou campos de promotor. Rejeitar PATCH vazio.

Não implementar exclusão, listagem geral nem busca pública por telefone/documento nesta fase. O formulário de consulta pode usar UUID.

- 400 para payload inválido.
- 401 para credencial ausente/inválida.
- 403 para credencial válida incompatível com a banca.
- 404 para usuário ausente na banca corrente, inclusive quando existir em outra banca.
- 409 para conflito de telefone, documento ou email dentro da banca, incluindo concorrência detectada pelo banco.
- Erros padronizados, sem stack trace, SQL ou dados pessoais.
- Não registrar documento, telefone, email, payload completo ou credenciais nos logs.

## Interface mínima

Criar uma página simples por domínio de desenvolvimento, com nome e cores da banca, formulário de cadastro, consulta por UUID e edição dos campos permitidos. Exibir o contrato retornado para facilitar a validação local. A carteira aparece somente para leitura e zerada. Usar o backend real, sem localStorage como banco e sem respostas mockadas em execução normal.

## Verificação obrigatória

Implementar testes de integração com PostgreSQL real cobrindo os riscos principais:

1. Cadastro persiste usuário e exatamente uma carteira zerada, retornando todos os campos do contrato.
2. Falha na criação da carteira desfaz o cadastro inteiro.
3. Telefone/documento/email duplicado na mesma banca retorna conflito; em bancas diferentes é permitido.
4. GET e PATCH não acessam usuário de outra banca.
5. A role de runtime e as políticas RLS bloqueiam leitura/escrita cruzadas e acesso sem contexto.
6. Requisições alternadas e concorrentes pelo pool não reutilizam contexto de outra banca.
7. Campos protegidos são rejeitados; PATCH respeita ausente versus null.
8. Cadastros concorrentes recebem displayIds distintos.
9. Credenciais não aparecem no bundle do navegador e credencial de uma banca não autoriza outra.

Usar apenas dados sintéticos. Não enfraquecer testes ou validações para acomodar o exemplo de dados pessoais.

## Entrega e execução

Entregar arquivos completos, migrations versionadas, seed idempotente de duas bancas fictícias, .env.example sem segredos reais e README com:

- Pré-requisitos e versões utilizadas.
- Comandos exatos de instalação, inicialização, migrations, seed, build e testes.
- Configuração dos dois hostnames locais e das credenciais de desenvolvimento.
- Exemplos de requisições com placeholders ou dados sintéticos.
- Contrato monetário em centavos e comportamento dos campos derivados/nullables.
- Explicação breve do isolamento de tenants e da limitação de autenticação nesta fase.

Execute build, checagem de tipos e os testes relevantes quando o ambiente permitir. Informe o que foi efetivamente executado e qualquer impedimento real. Não alegue que verificou o que não executou.

Ao concluir, apresente um resumo dos arquivos principais, como iniciar o projeto e limitações restantes. Mantenha o trabalho restrito à estrutura inicial e persistência de usuários descritas neste documento.
