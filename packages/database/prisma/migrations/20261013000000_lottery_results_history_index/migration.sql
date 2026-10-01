-- Loterias > Atrasados lê o histórico de uma loteria/extração (o último ano, do dia mais recente para trás). O índice
-- único começa pela data; este dá o caminho pela loteria, sem varrer os resultados de todas as loterias.

-- CreateIndex
CREATE INDEX "lottery_results_lottery_extraction_draw_date_idx" ON "lottery_results"("lottery", "extraction", "draw_date" DESC);
