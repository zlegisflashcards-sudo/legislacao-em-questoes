begin;

-- A leitura contínua usa legislative_references como fonte canônica. O fallback
-- mantém compatibilidade com dispositivos antigos que ainda existem somente em
-- legisbot_comentarios.
create or replace function public.legisbot_destaques_validate_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare legislation_text text;
begin
  new.slug := upper(btrim(new.slug));
  new.ordem := btrim(new.ordem);

  select coalesce(
    (
      select public.legisbot_destaques_plain_legal(reference.legislacao)
      from public.legislative_references as reference
      where lower(reference.slug) = lower(new.slug)
        and reference.ordem = new.ordem
      limit 1
    ),
    (
      select public.legisbot_destaques_plain_legal(comment.legislacao)
      from public.legisbot_comentarios as comment
      where comment.slug = new.slug
        and comment.ordem = new.ordem
      limit 1
    )
  ) into legislation_text;

  if legislation_text is null
    or new.fim > char_length(legislation_text)
    or substring(legislation_text from new.inicio + 1 for new.fim - new.inicio) <> new.trecho
  then
    raise exception 'Trecho destacado não corresponde à legislação original.';
  end if;
  return new;
end;
$$;

commit;
