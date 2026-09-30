-- Horóscopo do dia (API de horóscopo da Loteria Integrada): cache das previsões, uma linha por data e signo, global
-- (sem banca). A API busca uma vez por dia e o jogador só lê daqui. CHECKs repetem a validação da API.
-- DDL no formato do Prisma; regras e privilégios na segunda parte.

-- CreateTable
CREATE TABLE "horoscope_readings" (
    "reference_date" DATE NOT NULL,
    "sign" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tens" TEXT[],
    "colors" TEXT[],
    "fetched_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horoscope_readings_pkey" PRIMARY KEY ("reference_date","sign")
);



-- Cores: até 10, cada uma com 1 a 30 caracteres (CHECK não aceita subconsulta).
CREATE FUNCTION "horoscope_colors_valid"(p_colors text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  AS $$
  SELECT cardinality(p_colors) <= 10
     AND (cardinality(p_colors) = 0 OR array_ndims(p_colors) = 1)
     AND NOT EXISTS (SELECT 1 FROM unnest(p_colors) AS c WHERE c IS NULL OR char_length(c) NOT BETWEEN 1 AND 30)
$$;

ALTER TABLE "horoscope_readings"
  ALTER COLUMN "tens" SET NOT NULL,
  ALTER COLUMN "colors" SET NOT NULL,
  ADD CONSTRAINT "horoscope_readings_sign" CHECK ("sign" IN ('aries', 'touro', 'gemeos', 'cancer', 'leao', 'virgem',
    'libra', 'escorpiao', 'sagitario', 'capricornio', 'aquario', 'peixes')),
  ADD CONSTRAINT "horoscope_readings_text" CHECK (char_length("text") BETWEEN 1 AND 2000),
  ADD CONSTRAINT "horoscope_readings_tens" CHECK (
    array_ndims("tens") = 1 AND cardinality("tens") BETWEEN 1 AND 10
    AND array_to_string("tens", ',') ~ '^[0-9]{2}(,[0-9]{2})*$'),
  ADD CONSTRAINT "horoscope_readings_colors" CHECK ("horoscope_colors_valid"("colors")),
  ADD CONSTRAINT "horoscope_readings_reference_date" CHECK ("reference_date" >= DATE '2020-01-01');

-- Privilégios da role de runtime: lê, inclui e atualiza a previsão (correção do provedor). Não exclui.
REVOKE ALL ON "horoscope_readings" FROM PUBLIC;
GRANT SELECT ON "horoscope_readings" TO "sysjb_app";
GRANT INSERT ("reference_date", "sign", "text", "tens", "colors") ON "horoscope_readings" TO "sysjb_app";
GRANT UPDATE ("text", "tens", "colors", "fetched_at") ON "horoscope_readings" TO "sysjb_app";
