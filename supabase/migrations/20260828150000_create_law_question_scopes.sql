begin;

-- Recortes são somente seleções de nós da estrutura canônica. Eles nunca
-- armazenam cópias de public.questions.
create table if not exists public.recortes_leis (
  id uuid primary key default gen_random_uuid(),
  lei_id bigint not null references public.leis(id) on delete restrict,
  nome text not null check (btrim(nome) <> ''),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recortes_leis_lei_nome_key unique (lei_id, nome),
  constraint recortes_leis_id_lei_key unique (id, lei_id)
);

alter table public.law_structure add constraint law_structure_id_lei_key unique (id, lei_id);

create table if not exists public.recortes_leis_estrutura (
  recorte_id uuid not null references public.recortes_leis(id) on delete cascade,
  structure_id bigint not null references public.law_structure(id) on delete cascade,
  lei_id bigint not null references public.leis(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (recorte_id, structure_id),
  constraint recortes_leis_estrutura_recorte_lei_fkey foreign key (recorte_id, lei_id)
    references public.recortes_leis(id, lei_id) on delete cascade,
  constraint recortes_leis_estrutura_structure_lei_fkey foreign key (structure_id, lei_id)
    references public.law_structure(id, lei_id) on delete cascade
);

create index if not exists recortes_leis_lei_ativo_idx
  on public.recortes_leis (lei_id, ativo, nome);
create index if not exists recortes_leis_estrutura_structure_idx
  on public.recortes_leis_estrutura (structure_id);

-- O tipo artigo é incremental: nós e questões existentes continuam válidos,
-- enquanto novos recortes podem apontar para artigos específicos.
alter table public.law_structure drop constraint if exists law_structure_tipo_check;
alter table public.law_structure add constraint law_structure_tipo_check
  check (tipo in ('titulo', 'capitulo', 'secao', 'subsecao', 'artigo'));

-- A composição comercial continua pertencendo ao produto/edital. O recorte é
-- opcional: NULL preserva exatamente a lei completa usada hoje.
alter table public.produto_leis
  add column if not exists recorte_id uuid,
  add column if not exists recorte_lei_id bigint,
  add constraint produto_leis_recorte_par_check check ((recorte_id is null and recorte_lei_id is null) or (recorte_id is not null and recorte_lei_id = lei_id)),
  add constraint produto_leis_recorte_lei_fkey foreign key (recorte_id, recorte_lei_id) references public.recortes_leis(id, lei_id) on delete restrict;
alter table public.editais_personalizados_leis
  add column if not exists recorte_id uuid,
  add column if not exists recorte_lei_id bigint,
  add constraint editais_personalizados_leis_recorte_par_check check ((recorte_id is null and recorte_lei_id is null) or (recorte_id is not null and recorte_lei_id = lei_id)),
  add constraint editais_personalizados_leis_recorte_lei_fkey foreign key (recorte_id, recorte_lei_id) references public.recortes_leis(id, lei_id) on delete restrict;
create index if not exists produto_leis_recorte_idx on public.produto_leis (recorte_id) where recorte_id is not null;
create index if not exists editais_personalizados_leis_recorte_idx on public.editais_personalizados_leis (recorte_id) where recorte_id is not null;

create or replace function public.recortes_leis_definir_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists recortes_leis_definir_updated_at on public.recortes_leis;
create trigger recortes_leis_definir_updated_at before update on public.recortes_leis
  for each row execute function public.recortes_leis_definir_updated_at();

alter table public.recortes_leis enable row level security;
alter table public.recortes_leis_estrutura enable row level security;
revoke all on public.recortes_leis, public.recortes_leis_estrutura from public, anon, authenticated;
grant select, insert, update, delete on public.recortes_leis, public.recortes_leis_estrutura to service_role;

-- Operação atômica, exclusiva do backend administrativo (service_role). A
-- validação composta impede misturar uma estrutura de outra lei no recorte.
create or replace function public.admin_salvar_recorte_lei(
  p_recorte_id uuid,
  p_lei_id bigint,
  p_nome text,
  p_descricao text,
  p_ativo boolean,
  p_structure_ids bigint[]
) returns uuid language plpgsql security definer set search_path=pg_catalog as $function$
declare v_id uuid; v_total integer; v_valid integer;
begin
  if pg_catalog.btrim(coalesce(p_nome,''))='' then raise exception using errcode='22023',message='Nome do recorte invalido.'; end if;
  if cardinality(coalesce(p_structure_ids,array[]::bigint[]))=0 then raise exception using errcode='22023',message='Selecione ao menos uma estrutura.'; end if;
  select count(*),count(distinct x) into v_total,v_valid from pg_catalog.unnest(p_structure_ids) x;
  if v_total<>v_valid then raise exception using errcode='22023',message='Estrutura duplicada no recorte.'; end if;
  select count(*) into v_valid from public.law_structure where lei_id=p_lei_id and ativo and id=any(p_structure_ids);
  if v_valid<>v_total then raise exception using errcode='22023',message='A estrutura selecionada nao pertence a esta lei.'; end if;
  if p_recorte_id is null then
    insert into public.recortes_leis(lei_id,nome,descricao,ativo) values(p_lei_id,pg_catalog.btrim(p_nome),nullif(pg_catalog.btrim(coalesce(p_descricao,'')),''),coalesce(p_ativo,true)) returning id into v_id;
  else
    update public.recortes_leis set nome=pg_catalog.btrim(p_nome),descricao=nullif(pg_catalog.btrim(coalesce(p_descricao,'')),''),ativo=coalesce(p_ativo,true) where id=p_recorte_id and lei_id=p_lei_id returning id into v_id;
    if v_id is null then raise exception using errcode='P0002',message='Recorte nao encontrado para esta lei.'; end if;
    delete from public.recortes_leis_estrutura where recorte_id=v_id;
  end if;
  insert into public.recortes_leis_estrutura(recorte_id,structure_id,lei_id)
  select v_id,x,p_lei_id from pg_catalog.unnest(p_structure_ids) x;
  return v_id;
end;
$function$;
revoke all on function public.admin_salvar_recorte_lei(uuid,bigint,text,text,boolean,bigint[]) from public, anon, authenticated;
grant execute on function public.admin_salvar_recorte_lei(uuid,bigint,text,text,boolean,bigint[]) to service_role;

create or replace function public.admin_definir_leis_produto_recortes(
  p_ator_user_id uuid, p_produto_id uuid, p_vinculos jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $function$
declare v_total integer; v_valid integer;
begin
  perform public.admin_comercial_validar_contexto(p_ator_user_id);
  if jsonb_typeof(p_vinculos) <> 'array' then raise exception using errcode='22023',message='Composicao invalida.'; end if;
  select count(*),count(distinct (item->>'lei_id')::bigint) into v_total,v_valid from jsonb_array_elements(p_vinculos) item;
  if v_total<>v_valid then raise exception using errcode='22023',message='Composicao contem lei duplicada.'; end if;
  if exists(select 1 from jsonb_array_elements(p_vinculos) item where jsonb_typeof(item) <> 'object' or coalesce(item->>'lei_id','') !~ '^\d+$' or (item ? 'recorte_id' and item->>'recorte_id' <> '' and not exists(select 1 from public.recortes_leis r where r.id=(item->>'recorte_id')::uuid and r.lei_id=(item->>'lei_id')::bigint and r.ativo))) then raise exception using errcode='22023',message='Recorte invalido ou inativo para a lei selecionada.'; end if;
  delete from public.produto_leis where produto_id=p_produto_id;
  insert into public.produto_leis(produto_id,lei_id,ordem,recorte_id,recorte_lei_id)
  select p_produto_id,(item->>'lei_id')::bigint,ord::integer-1,nullif(item->>'recorte_id','')::uuid,case when nullif(item->>'recorte_id','') is null then null else (item->>'lei_id')::bigint end
  from jsonb_array_elements(p_vinculos) with ordinality as x(item,ord);
  return jsonb_build_object('produto_id',p_produto_id,'vinculos',p_vinculos);
end;
$function$;
revoke all on function public.admin_definir_leis_produto_recortes(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_definir_leis_produto_recortes(uuid,uuid,jsonb) to service_role;

-- O payload preserva a forma legada; recorte_id só é enviado quando houver um
-- escopo configurado. A UI pode então abrir o Estudo Livre contextualizado.
create or replace function public.obter_meus_editais()
returns jsonb language sql stable security definer set search_path=pg_catalog as $function$
  with aluno as (select id from public.alunos where user_id=auth.uid()),
  personalizado as (select e.id,e.nome from public.editais_personalizados_alunos e join aluno a on a.id=e.aluno_id),
  progresso as (select p.lei_id,p.em_estudo,p.questoes_finalizadas from public.progresso_leis_alunos p join aluno a on a.id=p.aluno_id),
  meu as (
    select jsonb_build_object('id',coalesce((select id from personalizado limit 1),0),'tipo','personalizado','nome',coalesce((select nome from personalizado limit 1),'Meu Edital'),'leis',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'slug',l.slug,'titulo',l.titulo,'ordem',pl.ordem,'recorte_id',pl.recorte_id,'em_estudo',coalesce(pr.em_estudo,false),'revisao',coalesce(pr.questoes_finalizadas,false)) order by pl.ordem,l.id) from personalizado p join public.editais_personalizados_leis pl on pl.edital_id=p.id join public.leis l on l.id=pl.lei_id and l.ativo=true left join progresso pr on pr.lei_id=l.id),'[]'::jsonb)) as item
  ),
  produtos as (
    select jsonb_build_object('id',p.id::text,'tipo','produto','nome',p.nome,'leis',coalesce(jsonb_agg(jsonb_build_object('id',l.id,'slug',l.slug,'titulo',l.titulo,'ordem',pl.ordem,'recorte_id',pl.recorte_id,'em_estudo',coalesce(pr.em_estudo,false),'revisao',coalesce(pr.questoes_finalizadas,false)) order by pl.ordem,l.id),'[]'::jsonb)) as item
    from public.produtos p join public.produto_leis pl on pl.produto_id=p.id join public.leis l on l.id=pl.lei_id and l.ativo=true left join progresso pr on pr.lei_id=l.id
    where p.tipo_produto='edital' and p.ativo=true and exists(select 1 from public.compras c join aluno a on a.id=c.aluno_id where c.produto_id=p.id and c.status_acesso='ativo')
    group by p.id,p.nome,p.ordem
  )
  select jsonb_build_object('editais',coalesce((select jsonb_agg(item order by pos) from (select 0 pos,item from meu union all select 1,item from produtos) x),'[]'::jsonb));
$function$;

revoke all on function public.obter_meus_editais() from public, anon, service_role;
grant execute on function public.obter_meus_editais() to authenticated;

comment on table public.recortes_leis is 'Recortes estruturais de uma lei, usados para reutilizar questões canônicas sem cópias.';
comment on table public.recortes_leis_estrutura is 'Nós estruturais explicitamente incluídos em um recorte; descendentes são resolvidos em leitura.';

commit;
