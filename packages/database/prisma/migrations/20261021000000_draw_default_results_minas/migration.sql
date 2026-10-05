-- Sorteios de Minas ligados ao resultado do provedor (sigla mg), confirmados pela operação:
-- LT ALVORADA 12HS -> mg 12 e LT MINAS PREF 21HS -> mg 21. Só dados e a função do cadastro padrão.

CREATE OR REPLACE FUNCTION "draw_default_result"(p_name text) RETURNS TABLE ("lottery" text, "extraction" smallint)
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
    ('LT NACIONAL 21HS', 'ln', 20),  ('LT NACIONAL 23HS', 'ln', 23),
    ('LT LOOK 07HS', 'lk', 7),       ('LT LOOK 09HS', 'lk', 9),       ('LT LOOK 11HS', 'lk', 11),
    ('LT LOOK 14HS', 'lk', 14),      ('LT LOOK 16HS', 'lk', 16),      ('LT LOOK 18HS', 'lk', 18),
    ('LT LOOK 21HS', 'lk', 21),      ('LT LOOK 23HS', 'lk', 23),
    ('LT BOASORTE 09HS', 'bs', 9),   ('LT BOASORTE 11HS', 'bs', 11),  ('LT BOASORTE 14HS', 'bs', 14),
    ('LT BOASORTE 16HS', 'bs', 16),  ('LT BOASORTE 18HS', 'bs', 18),  ('LT BOASORTE 21HS', 'bs', 21),
    ('PT SP 08HS', 'sp', 8),         ('PT SP 10HS', 'sp', 10),        ('PT SP 12HS', 'sp', 12),
    ('PT SP 13HS', 'sp', 13),        ('LT BAND 15HS', 'sp', 15),      ('PT SP 17HS', 'sp', 17),
    ('PT SP 19HS', 'sp', 19),
    ('LT LOTEP 09HS', 'pb', 9),      ('LT LOTEP 10HS', 'pb', 10),     ('LT LOTEP 12HS', 'pb', 12),
    ('LT LOTEP 15HS', 'pb', 15),     ('LT LOTEP 18HS', 'pb', 18),     ('LT LOTEP 20HS', 'pb', 20),
    ('LT BAHIA 10HS', 'ba', 10),     ('LT BAHIA 12HS', 'ba', 12),     ('LT BAHIA 15HS', 'ba', 15),
    ('LT BAHIA 19HS', 'ba', 19),     ('LT BAHIA 21HS', 'ba', 21),
    ('LT BA MALUCA 10HS', 'mba', 10), ('LT BA MALUCA 12HS', 'mba', 12), ('LT BA MALUCA 15HS', 'mba', 15),
    ('LT BA MALUCA 19HS', 'mba', 19), ('LT BA MALUCA 21HS', 'mba', 21),
    ('LT LOTECE 10HS', 'lce', 11),   ('LT LOTECE 14HS', 'lce', 14),   ('LT LOTECE 16HS', 'lce', 15),
    ('LT LOTECE 19HS', 'lce', 19),
    ('LT ALVORADA 12HS', 'mg', 12),    ('LT MINAS DIA 15HS', 'mg', 15),  ('LT MINAS PREF 21HS', 'mg', 21)
  ) AS v(name, lottery, extraction)
  WHERE v.name = p_name
$$;

-- Bancas existentes: liga só os sorteios ainda sem ligação (o que o painel já definiu não muda).
SELECT "draws_seed_default_results"("id") FROM "tenants";
