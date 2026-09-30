-- Resultado do provedor que vale para cada sorteio da banca (Resultados > Resultado loterias): sigla + extração do
-- provedor. A extração é a hora do provedor, que pode não ser a do sorteio da banca (ex.: "LT FEDERAL" às 20h na banca
-- é a Federal das 19h do provedor). Editável no painel (Sorteios); null = sem ligação (o jogador não vê resultado).
-- DDL no formato do Prisma; regras, dados, funções e privilégios na segunda parte.

-- AlterTable
ALTER TABLE "draws" ADD COLUMN "result_extraction" SMALLINT,
ADD COLUMN "result_lottery" TEXT;


-- ---------------------------------------------------------------------------
-- Os dois juntos ou nenhum; sigla como a do provedor (2 a 4 letras minúsculas) e extração de 0 a 23. A lista de
-- loterias/extrações aceitas (catálogo) é conferida pela API: o provedor pode ganhar loterias novas.
-- ---------------------------------------------------------------------------
ALTER TABLE "draws"
  ADD CONSTRAINT "draws_result_source_pair"
    CHECK (("result_lottery" IS NULL) = ("result_extraction" IS NULL)),
  ADD CONSTRAINT "draws_result_lottery_format"
    CHECK ("result_lottery" IS NULL OR "result_lottery" ~ '^[a-z]{2,4}$'),
  ADD CONSTRAINT "draws_result_extraction_range"
    CHECK ("result_extraction" IS NULL OR "result_extraction" BETWEEN 0 AND 23);

-- ---------------------------------------------------------------------------
-- Ligação dos sorteios do cadastro padrão (draws_seed_defaults), só onde é certa. Ficam sem ligação os que o
-- provedor não tem (Lotece, Capital, Alvorada, Minas Pref) e os ambíguos (Lotep 09h/20h: nessas horas o "pb" do
-- provedor é a PT Paraíba; Nacional 21h e Maluquinha Federal: sem extração correspondente).
-- ---------------------------------------------------------------------------
CREATE FUNCTION "draw_default_result"(p_name text) RETURNS TABLE ("lottery" text, "extraction" smallint)
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT v.lottery, v.extraction::smallint
  FROM (VALUES
    ('LT PT RIO 09HS', 'rj', 9),     ('LT PT RIO 11HS', 'rj', 11),    ('LT PT RIO 14HS', 'rj', 14),
    ('LT PT RIO 16HS', 'rj', 16),    ('LT PT RIO 21HS', 'rj', 21),    ('LT FEDERAL', 'fd', 19),
    ('LT MALUQ RIO 09HS', 'mrj', 9), ('LT MALUQ RIO 11HS', 'mrj', 11), ('LT MALUQ RIO 14HS', 'mrj', 14),
    ('LT MALUQ RIO 16HS', 'mrj', 16), ('LT MALUQ RIO 21HS', 'mrj', 21),
    ('LT NACIONAL 02HS', 'ln', 2),   ('LT NACIONAL 08HS', 'ln', 8),   ('LT NACIONAL 10HS', 'ln', 10),
    ('LT NACIONAL 12HS', 'ln', 12),  ('LT NACIONAL 15HS', 'ln', 15),  ('LT NACIONAL 17HS', 'ln', 17),
    ('LT NACIONAL 23HS', 'ln', 23),
    ('LT LOOK 07HS', 'lk', 7),       ('LT LOOK 09HS', 'lk', 9),       ('LT LOOK 11HS', 'lk', 11),
    ('LT LOOK 14HS', 'lk', 14),      ('LT LOOK 16HS', 'lk', 16),      ('LT LOOK 18HS', 'lk', 18),
    ('LT LOOK 21HS', 'lk', 21),      ('LT LOOK 23HS', 'lk', 23),
    ('LT BOASORTE 09HS', 'bs', 9),   ('LT BOASORTE 11HS', 'bs', 11),  ('LT BOASORTE 14HS', 'bs', 14),
    ('LT BOASORTE 16HS', 'bs', 16),  ('LT BOASORTE 18HS', 'bs', 18),  ('LT BOASORTE 21HS', 'bs', 21),
    ('PT SP 08HS', 'sp', 8),         ('PT SP 10HS', 'sp', 10),        ('PT SP 12HS', 'sp', 12),
    ('PT SP 13HS', 'sp', 13),        ('LT BAND 15HS', 'sp', 15),      ('PT SP 17HS', 'sp', 17),
    ('PT SP 19HS', 'sp', 19),
    ('LT LOTEP 10HS', 'pb', 10),     ('LT LOTEP 12HS', 'pb', 12),     ('LT LOTEP 15HS', 'pb', 15),
    ('LT LOTEP 18HS', 'pb', 18),
    ('LT BAHIA 10HS', 'ba', 10),     ('LT BAHIA 12HS', 'ba', 12),     ('LT BAHIA 15HS', 'ba', 15),
    ('LT BAHIA 19HS', 'ba', 19),     ('LT BAHIA 21HS', 'ba', 21),
    ('LT BA MALUCA 10HS', 'mba', 10), ('LT BA MALUCA 12HS', 'mba', 12), ('LT BA MALUCA 15HS', 'mba', 15),
    ('LT BA MALUCA 19HS', 'mba', 19), ('LT BA MALUCA 21HS', 'mba', 21),
    ('LT MINAS DIA 15HS', 'mg', 15)
  ) AS v(name, lottery, extraction)
  WHERE v.name = p_name
$$;

-- Liga os sorteios sem ligação da banca que têm nome do cadastro padrão (não mexe no que o painel já definiu).
CREATE FUNCTION "draws_seed_default_results"(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  v_previous text := current_setting('app.tenant_id', true);
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  UPDATE "draws" d
  SET "result_lottery" = r."lottery", "result_extraction" = r."extraction"
  FROM "draws" s
  CROSS JOIN LATERAL "draw_default_result"(s."name") r
  WHERE d."id" = s."id" AND d."tenant_id" = p_tenant AND d."result_lottery" IS NULL;
  PERFORM set_config('app.tenant_id', COALESCE(v_previous, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION "draws_seed_default_results"(uuid) FROM PUBLIC;

-- O cadastro padrão (banca nova e quem mais o chamar) já sai ligado aos resultados: a função antiga vira a parte
-- das linhas e draws_seed_defaults passa a fazer as duas coisas (o trigger de banca nova a chama pelo nome).
ALTER FUNCTION "draws_seed_defaults"(uuid) RENAME TO "draws_seed_default_rows";

CREATE FUNCTION "draws_seed_defaults"(p_tenant uuid) RETURNS void
  LANGUAGE plpgsql
  AS $$
BEGIN
  PERFORM "draws_seed_default_rows"(p_tenant);
  PERFORM "draws_seed_default_results"(p_tenant);
END;
$$;

REVOKE ALL ON FUNCTION "draws_seed_defaults"(uuid) FROM PUBLIC;

-- Bancas existentes.
SELECT "draws_seed_default_results"("id") FROM "tenants";

-- ---------------------------------------------------------------------------
-- Privilégios da role de runtime: o painel cadastra e altera a ligação.
-- ---------------------------------------------------------------------------
GRANT INSERT ("result_lottery", "result_extraction") ON "draws" TO "sysjb_app";
GRANT UPDATE ("result_lottery", "result_extraction") ON "draws" TO "sysjb_app";
