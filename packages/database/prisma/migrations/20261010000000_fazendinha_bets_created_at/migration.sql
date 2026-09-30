-- Painel > Bilhetes lista os pules da banca por dia da venda (Loterias e Fazendinha juntos). lottery_tickets já tem
-- (tenant_id, created_at); este índice dá o mesmo caminho à Fazendinha, sem varrer todos os pules da banca.

-- CreateIndex
CREATE INDEX "fazendinha_bets_tenant_id_created_at_idx" ON "fazendinha_bets"("tenant_id", "created_at");
