-- Limite de requisições (rate limiting) da API: contadores por janela fixa, compartilhados por todas as instâncias.
-- A chave identifica regra + sujeito + tamanho da janela (ex.: "user_write:u:<uuid>:60"); IP entra só como HMAC
-- (dado pessoal), nunca em texto. Sem banca: o limite por IP vale antes de haver sessão. Linhas vencidas são
-- apagadas pela própria API.

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key","window_start")
);

-- CreateIndex
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters"("expires_at");

ALTER TABLE "rate_limit_counters"
  ADD CONSTRAINT "rate_limit_counters_key_format" CHECK ("key" ~ '^[a-z_]+:[a-z]:[A-Za-z0-9_-]{1,64}:[0-9]{1,6}$'),
  ADD CONSTRAINT "rate_limit_counters_hits_positive" CHECK ("hits" >= 1),
  ADD CONSTRAINT "rate_limit_counters_window" CHECK ("expires_at" > "window_start");

-- Privilégios da role de runtime: conta (INSERT ... ON CONFLICT DO UPDATE), lê e limpa o que venceu.
REVOKE ALL ON "rate_limit_counters" FROM PUBLIC;
GRANT SELECT, DELETE ON "rate_limit_counters" TO "sysjb_app";
GRANT INSERT ("key", "window_start", "hits", "expires_at") ON "rate_limit_counters" TO "sysjb_app";
GRANT UPDATE ("hits") ON "rate_limit_counters" TO "sysjb_app";
