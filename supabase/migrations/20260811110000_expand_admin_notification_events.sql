begin;

create or replace function public.criar_notificacao_admin_novo_comentario()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  v_autor text;
  v_tipo text;
  v_titulo text;
  v_mensagem text;
begin
  select coalesce(nullif(btrim(p.nome_publico), ''), 'Estudante Legis') into v_autor
  from public.perfis_publicos p where p.id = new.user_id;

  if new.parent_id is null then
    v_tipo := 'novo_comentario';
    v_titulo := 'Novo comentário';
    v_mensagem := coalesce(v_autor, 'Estudante Legis') || ' comentou em ' || new.slug || ' / ' || new.ordem;
  else
    v_tipo := 'resposta_comentario';
    v_titulo := 'Nova resposta em comentário';
    v_mensagem := coalesce(v_autor, 'Estudante Legis') || ' respondeu a um comentário em ' || new.slug || ' / ' || new.ordem;
  end if;

  insert into public.admin_notificacoes(tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
  values (v_tipo, v_titulo, v_mensagem, '/legisbot/' || lower(new.slug) || '/' || new.ordem || '#community-title', 'legisbot_comentario_comunidade', new.id::text)
  on conflict (entidade_tipo, entidade_id) do nothing;
  return new;
end;
$function$;

create or replace function public.criar_notificacao_admin_denuncia_comentario()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_slug text;
begin
  select slug into v_slug from public.legisbot_comentarios_comunidade where id = new.comentario_id;
  insert into public.admin_notificacoes(tipo, titulo, mensagem, link, entidade_tipo, entidade_id)
  values ('denuncia_comentario', 'Denúncia de comentário', 'Uma denúncia foi recebida. Motivo: ' || new.motivo || '.', '/admin/comunidade?denunciados=1&q=' || coalesce(replace(v_slug, ' ', '%20'), ''), 'legisbot_denuncia_comentario', new.id::text)
  on conflict (entidade_tipo, entidade_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists criar_notificacao_admin_denuncia_comentario on public.legisbot_comentarios_denuncias;
create trigger criar_notificacao_admin_denuncia_comentario
after insert on public.legisbot_comentarios_denuncias
for each row execute function public.criar_notificacao_admin_denuncia_comentario();

comment on table public.admin_notificacoes is
  'Central administrativa: comentários, respostas, denúncias e eventos operacionais.';

commit;
