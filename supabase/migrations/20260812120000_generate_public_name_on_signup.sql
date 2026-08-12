begin;

create or replace function public.legisbot_community_create_profile()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  suggested_name text;
  attempts integer := 0;
begin
  suggested_name := nullif(btrim(new.raw_user_meta_data ->> 'nome_publico'), '');
  if suggested_name is not null and exists (select 1 from public.perfis_publicos where lower(btrim(nome_publico)) = lower(suggested_name)) then
    raise exception using errcode = '23505', message = 'Nome público já está em uso.';
  end if;
  while suggested_name is null loop
    attempts := attempts + 1;
    if attempts > 100 then raise exception using errcode = 'P0001', message = 'Não foi possível gerar um nome público único.'; end if;
    suggested_name := 'estudante' || lpad((floor(random() * 1000000))::integer::text, 6, '0');
    if exists (select 1 from public.perfis_publicos where lower(btrim(nome_publico)) = lower(suggested_name)) then suggested_name := null; end if;
  end loop;
  insert into public.perfis_publicos (id, nome_publico) values (new.id, suggested_name) on conflict (id) do nothing;
  return new;
end;
$function$;

commit;
