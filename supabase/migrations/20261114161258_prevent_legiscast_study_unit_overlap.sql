begin;

-- Uma estrutura só pode participar de uma unidade de estudo com áudio ativo.
-- A regra atua tanto no vínculo principal da faixa quanto nas coberturas
-- editoriais adicionais. Ela não infere descendência: compara apenas a
-- estrutura explicitamente declarada em cada registro.
create or replace function public.assert_legiscast_study_unit_no_overlap()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_law_id bigint;
  v_structure_id bigint;
  v_audio_id uuid;
  v_active boolean;
begin
  if tg_table_name = 'legiscast_audios' then
    v_law_id := new.lei_id;
    v_structure_id := new.structure_id;
    v_audio_id := new.id;
    v_active := new.ativo;
  else
    select lei_id, ativo into v_law_id, v_active
      from public.legiscast_audios
     where id = new.audio_id;
    v_structure_id := new.structure_id;
    v_audio_id := new.audio_id;
  end if;

  if not coalesce(v_active, false) or v_structure_id is null then
    return new;
  end if;

  if exists (
    select 1
      from public.legiscast_audios other_audio
     where other_audio.lei_id = v_law_id
       and other_audio.ativo = true
       and other_audio.id <> v_audio_id
       and other_audio.structure_id = v_structure_id
  ) or exists (
    select 1
      from public.legiscast_audio_structure_coverage other_coverage
      join public.legiscast_audios other_audio on other_audio.id = other_coverage.audio_id
     where other_coverage.lei_id = v_law_id
       and other_coverage.structure_id = v_structure_id
       and other_audio.ativo = true
       and other_audio.id <> v_audio_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'A estrutura já possui cobertura de outro áudio ativo.',
      detail = format('lei_id=%s structure_id=%s audio_id=%s', v_law_id, v_structure_id, v_audio_id),
      hint = 'Remova ou desative a cobertura conflitante antes de salvar.';
  end if;

  return new;
end;
$function$;

drop trigger if exists legiscast_audio_no_overlap on public.legiscast_audios;
create trigger legiscast_audio_no_overlap
before insert or update of lei_id, structure_id, ativo on public.legiscast_audios
for each row execute function public.assert_legiscast_study_unit_no_overlap();

drop trigger if exists legiscast_audio_coverage_no_overlap on public.legiscast_audio_structure_coverage;
create trigger legiscast_audio_coverage_no_overlap
before insert or update of audio_id, lei_id, structure_id on public.legiscast_audio_structure_coverage
for each row execute function public.assert_legiscast_study_unit_no_overlap();

commit;

-- Rollback manual seguro, somente se esta for a última migration aplicada:
-- begin;
-- drop trigger if exists legiscast_audio_coverage_no_overlap on public.legiscast_audio_structure_coverage;
-- drop trigger if exists legiscast_audio_no_overlap on public.legiscast_audios;
-- drop function if exists public.assert_legiscast_study_unit_no_overlap();
-- commit;
