-- Compatibilidade com a Data API para o caminho ativo do LegisBot.
-- A insercao ocorre na RPC SECURITY DEFINER; o servidor usa service_role
-- diretamente apenas para ler e atualizar a reserva/comentario.
grant select, update on table public.legisbot_comentarios to service_role;

