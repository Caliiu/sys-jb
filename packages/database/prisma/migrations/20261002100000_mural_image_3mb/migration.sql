-- Imagem do mural: limite sobe de 2 MB para 3 MB (MURAL_LIMITS.imageMaxBytes em @sysjb/contracts).
ALTER TABLE "murals"
  DROP CONSTRAINT "murals_image_size",
  ADD CONSTRAINT "murals_image_size" CHECK (octet_length("image") BETWEEN 1 AND 3145728);
