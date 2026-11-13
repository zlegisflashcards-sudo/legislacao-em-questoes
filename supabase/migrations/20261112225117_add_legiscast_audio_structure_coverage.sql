begin;

-- A estrutura principal continua em legiscast_audios.structure_id. Esta tabela
-- registra somente coberturas editoriais adicionais, nunca inferidas pela
-- hierarquia ou pelo nome do arquivo.
do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.legiscast_audios'::regclass
      and conname = 'legiscast_audios_id_lei_id_key'
  ) then
    alter table public.legiscast_audios
      add constraint legiscast_audios_id_lei_id_key unique (id, lei_id);
  end if;
end
$do$;

create table public.legiscast_audio_structure_coverage (
  audio_id uuid not null,
  lei_id bigint not null,
  structure_id bigint not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (audio_id, structure_id),
  constraint legiscast_audio_structure_coverage_audio_same_law_fkey
    foreign key (audio_id, lei_id)
    references public.legiscast_audios (id, lei_id)
    on update restrict
    on delete cascade,
  constraint legiscast_audio_structure_coverage_structure_same_law_fkey
    foreign key (structure_id, lei_id)
    references public.law_structure (id, lei_id)
    on update restrict
    on delete cascade
);

create index legiscast_audio_structure_coverage_structure_idx
  on public.legiscast_audio_structure_coverage (lei_id, structure_id, audio_id);

-- Não há acesso direto pela Data API: a administração chama a RPC abaixo
-- apenas após validar a sessão administrativa no servidor Next.js.
alter table public.legiscast_audio_structure_coverage enable row level security;
revoke all on table public.legiscast_audio_structure_coverage from public, anon, authenticated;
grant select, insert, update, delete on table public.legiscast_audio_structure_coverage to service_role;

create or replace function public.admin_set_legiscast_audio_structure_coverage(
  p_actor_user_id uuid,
  p_audio_id uuid,
  p_structure_id bigint,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_audio public.legiscast_audios;
  v_structure public.law_structure;
  v_before public.legiscast_audio_structure_coverage;
  v_after public.legiscast_audio_structure_coverage;
begin
  if p_action not in ('add', 'remove') then
    raise exception using errcode = '22023', message = 'Ação de cobertura inválida.';
  end if;

  select * into v_audio
    from public.legiscast_audios
   where id = p_audio_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Áudio não encontrado.';
  end if;

  select * into v_structure
    from public.law_structure
   where id = p_structure_id
     and lei_id = v_audio.lei_id
     and ativo = true;
  if not found then
    raise exception using errcode = '22023', message = 'Estrutura inválida para a lei deste áudio.';
  end if;

  -- O vínculo direto já é definido em legiscast_audios.structure_id. Evita
  -- duplicar a mesma evidência na tabela de coberturas adicionais.
  if v_audio.structure_id is not distinct from p_structure_id then
    return jsonb_build_object('changed', false, 'reason', 'direct_structure');
  end if;

  if p_action = 'add' then
    insert into public.legiscast_audio_structure_coverage(audio_id, lei_id, structure_id, created_by)
    values (v_audio.id, v_audio.lei_id, v_structure.id, p_actor_user_id)
    on conflict (audio_id, structure_id) do nothing
    returning * into v_after;

    if v_after.audio_id is null then
      return jsonb_build_object('changed', false, 'reason', 'already_covered');
    end if;

    insert into public.auditoria_administrativa(
      ator_user_id, acao, entidade, entidade_id, estado_posterior, detalhes
    ) values (
      p_actor_user_id, 'adicionar_cobertura_legiscast', 'legiscast_audio_structure_coverage',
      v_audio.id::text || ':' || v_structure.id::text, to_jsonb(v_after),
      jsonb_build_object('lei_id', v_audio.lei_id, 'audio_id', v_audio.id, 'structure_id', v_structure.id)
    );
    return jsonb_build_object('changed', true, 'coverage', to_jsonb(v_after));
  end if;

  select * into v_before
    from public.legiscast_audio_structure_coverage
   where audio_id = v_audio.id
     and structure_id = v_structure.id
   for update;
  if not found then
    return jsonb_build_object('changed', false, 'reason', 'not_covered');
  end if;

  delete from public.legiscast_audio_structure_coverage
   where audio_id = v_audio.id
     and structure_id = v_structure.id;

  insert into public.auditoria_administrativa(
    ator_user_id, acao, entidade, entidade_id, estado_anterior, detalhes
  ) values (
    p_actor_user_id, 'remover_cobertura_legiscast', 'legiscast_audio_structure_coverage',
    v_audio.id::text || ':' || v_structure.id::text, to_jsonb(v_before),
    jsonb_build_object('lei_id', v_audio.lei_id, 'audio_id', v_audio.id, 'structure_id', v_structure.id)
  );
  return jsonb_build_object('changed', true, 'coverage', to_jsonb(v_before));
end;
$function$;

revoke all on function public.admin_set_legiscast_audio_structure_coverage(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_legiscast_audio_structure_coverage(uuid, uuid, bigint, text)
  to service_role;

commit;

-- Rollback manual seguro, somente se esta for a última migration aplicada:
-- begin;
-- drop function if exists public.admin_set_legiscast_audio_structure_coverage(uuid, uuid, bigint, text);
-- drop table if exists public.legiscast_audio_structure_coverage;
-- alter table public.legiscast_audios drop constraint if exists legiscast_audios_id_lei_id_key;
-- commit;
