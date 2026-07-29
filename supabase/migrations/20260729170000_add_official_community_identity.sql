begin;

alter table public.legisbot_comentarios_comunidade
  add column publicado_como_equipe boolean not null default false;

create function public.legisbot_community_protect_official_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.publicado_como_equipe and not public.legisbot_community_is_admin() then
      raise exception 'Somente administradores podem publicar como Legis Flashcards.';
    end if;
    return new;
  end if;

  if new.publicado_como_equipe is distinct from old.publicado_como_equipe then
    raise exception 'A identidade escolhida na publicação não pode ser alterada.';
  end if;
  return new;
end;
$$;

create trigger legisbot_comunidade_official_identity
before insert or update on public.legisbot_comentarios_comunidade
for each row execute function public.legisbot_community_protect_official_identity();

commit;
