-- Cassino: o jogador vai ao PlayFivers como "<ID> <primeiro nome> - <banca>" (legível no painel do provedor). O webhook
-- identifica o jogador só pelo ID exibido (display_id, único em todas as bancas): a policy de busca passa a liberar a
-- linha pelo display_id em vez do id interno. A API só define app.casino_user com um inteiro já conferido.
DROP POLICY "users_casino_lookup" ON "users";
CREATE POLICY "users_casino_lookup" ON "users"
  FOR SELECT
  USING ("display_id" = NULLIF(current_setting('app.casino_user', true), '')::integer);
