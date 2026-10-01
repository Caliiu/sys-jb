-- Pules premiadas (Operação > Prêmios no painel): um registro por pule premiada, que a apuração de prêmios vai gravar
-- (ela ainda não existe; até lá a tabela fica vazia). Guarda o sorteio e o apostado como na venda.
-- DDL no formato do Prisma; regras, RLS e privilégios na segunda parte.

-- CreateTable
CREATE TABLE "pule_prizes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "game" TEXT NOT NULL,
    "pule_number" INTEGER NOT NULL,
    "draw_date" DATE NOT NULL,
    "lottery" TEXT NOT NULL,
    "draw_hour" SMALLINT NOT NULL,
    "draw_code" TEXT NOT NULL DEFAULT '',
    "stake_cents" BIGINT NOT NULL,
    "prize_cents" BIGINT NOT NULL,
    "settled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pule_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pule_prizes_tenant_id_draw_date_idx" ON "pule_prizes"("tenant_id", "draw_date");

-- CreateIndex
CREATE INDEX "pule_prizes_tenant_id_user_id_draw_date_idx" ON "pule_prizes"("tenant_id", "user_id", "draw_date");

-- CreateIndex
CREATE UNIQUE INDEX "pule_prizes_tenant_id_game_pule_number_key" ON "pule_prizes"("tenant_id", "game", "pule_number");

-- AddForeignKey
ALTER TABLE "pule_prizes" ADD CONSTRAINT "pule_prizes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pule_prizes" ADD CONSTRAINT "pule_prizes_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



ALTER TABLE "pule_prizes"
  ADD CONSTRAINT "pule_prizes_game" CHECK ("game" IN ('lotteries', 'fazendinha')),
  ADD CONSTRAINT "pule_prizes_pule_number_positive" CHECK ("pule_number" > 0),
  ADD CONSTRAINT "pule_prizes_draw_hour_range" CHECK ("draw_hour" BETWEEN 0 AND 23),
  ADD CONSTRAINT "pule_prizes_stake_positive" CHECK ("stake_cents" > 0),
  ADD CONSTRAINT "pule_prizes_prize_positive" CHECK ("prize_cents" > 0),
  ADD CONSTRAINT "pule_prizes_draw_date_range" CHECK ("draw_date" >= DATE '2020-01-01');

-- Isolamento por banca (como as outras tabelas de jogador).
ALTER TABLE "pule_prizes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pule_prizes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "pule_prizes_tenant_isolation" ON "pule_prizes"
  FOR ALL
  USING ("tenant_id" = "app_current_tenant_id"())
  WITH CHECK ("tenant_id" = "app_current_tenant_id"());

-- Por enquanto a role de runtime só consulta (painel). A apuração dará INSERT na migration dela; ninguém altera nem
-- apaga um prêmio.
REVOKE ALL ON "pule_prizes" FROM PUBLIC;
GRANT SELECT ON "pule_prizes" TO "sysjb_app";
