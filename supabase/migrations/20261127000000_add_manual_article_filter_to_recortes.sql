begin;

alter table public.recortes_leis add column if not exists artigos_filtro text;
comment on column public.recortes_leis.artigos_filtro is
  'Faixas do edital para filtrar somente questões/Anki na estrutura selecionada. Vazio mantém só a estrutura.';

-- New endpoint keeps the previous RPC available to running deployments.
create or replace function public.admin_salvar_recorte_lei_com_artigos(
  p_recorte_id uuid, p_lei_id bigint, p_nome text, p_nome_exibicao text,
  p_descricao text, p_ativo boolean, p_status_publicacao text,
  p_acesso_gratuito boolean, p_structure_ids bigint[], p_artigos_filtro text
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_id uuid;
  v_previous text;
  v_filter text := pg_catalog.btrim(coalesce(p_artigos_filtro, ''));
begin
  if pg_catalog.length(v_filter) > 500 or (v_filter <> '' and
     v_filter !~ '^[0-9]{1,6}(-[A-Z]{1,3})?(-[0-9]{1,6}(-[A-Z]{1,3})?)?(, [0-9]{1,6}(-[A-Z]{1,3})?(-[0-9]{1,6}(-[A-Z]{1,3})?)?)*$') then
    raise exception using errcode = '22023', message = 'Filtro de artigos inválido.';
  end if;
  if p_recorte_id is not null then
    select artigos_filtro into v_previous from public.recortes_leis
      where id = p_recorte_id and lei_id = p_lei_id for update;
    if coalesce(v_previous, '') <> v_filter and exists (
      select 1 from public.campanhas_leis_alunos
      where recorte_id = p_recorte_id and not concluida and not abandonada
    ) then
      raise exception using errcode = '22023',
        message = 'Este recorte tem campanha em andamento. Crie outro recorte para alterar os artigos sem afetar o progresso.';
    end if;
  end if;
  v_id := public.admin_salvar_recorte_lei(p_recorte_id, p_lei_id, p_nome, p_nome_exibicao,
    p_descricao, p_ativo, p_status_publicacao, p_acesso_gratuito, p_structure_ids);
  update public.recortes_leis set artigos_filtro = v_filter where id = v_id and lei_id = p_lei_id;
  return v_id;
end;
$function$;

revoke all on function public.admin_salvar_recorte_lei_com_artigos(uuid, bigint, text, text, text, boolean, text, boolean, bigint[], text) from public, anon, authenticated;
grant execute on function public.admin_salvar_recorte_lei_com_artigos(uuid, bigint, text, text, text, boolean, text, boolean, bigint[], text) to service_role;

update public.recortes_leis r
set artigos_filtro = s.filtro
from (values
  ('3e03d11b-cf6e-43f3-9d35-760fd3034d9b'::uuid, 58, '293-305, 307-308, 311-A, 312-317, 319-333, 336-337, 339-347, 357, 359'),
  ('7986ba0a-6707-46cd-9475-9ad5f52e3593'::uuid, 61, '251-258, 261-267, 274, 351-372, 394-497, 531-538, 541-548, 574-667'),
  ('69639148-cc8b-4de1-ba87-53fe18a0a8b1'::uuid, 14, '5-13, 37-41, 92'),
  ('01fd3157-dcc6-4c4a-92ca-e8af4b549c40'::uuid, 27, '3-19, 60-83, 88-89')
) s(id, lei, filtro)
where r.id = s.id and r.lei_id = s.lei and not r.ativo and r.artigos_filtro is null;

commit;
