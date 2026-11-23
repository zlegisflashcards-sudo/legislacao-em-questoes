import { createHash } from "node:crypto";
import { legalHtmlToStructuredText, sanitizeLegalHtmlCore } from "../lib/legisbot/sanitize-legal-html-core";
import { scopedReadingDigest } from "../lib/scoped-study-reading-pin";

export type Snapshot = {
  id: string; lei_id: number; ordem: string; identificacao: string; preparado_em: string;
  legislacao_atualizada_em: string | null; situacao: string; structure_id: number | null;
  legislacao_sha256: string; proposed_structure_id: number;
};
export type RawReference = Omit<Snapshot, "legislacao_sha256" | "proposed_structure_id"> & { legislacao: string };

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function makeScopedReadingSeed(snapshot: Snapshot[], raw: RawReference[], config: {
  lawId: number; scopeId: string; expectedCount: number; articleOwners: ReadonlyMap<number, number>;
}) {
  const { lawId, scopeId, expectedCount, articleOwners } = config;
  const byId = new Map(raw.map((row) => [row.id, row]));
  if (!Number.isSafeInteger(lawId) || !uuid.test(scopeId) || snapshot.length !== expectedCount || raw.length !== expectedCount ||
    byId.size !== expectedCount || new Set(snapshot.map((r) => r.id)).size !== expectedCount ||
    new Set(snapshot.map((r) => r.ordem)).size !== expectedCount) throw new Error("Lote ou escopo incompleto/duplicado.");
  const reject = (row: Snapshot, why: string) => { throw new Error(`${row.ordem}: ${why}`); };
  const blocks = snapshot.map((expected) => {
    const row = byId.get(expected.id);
    if (!row || !uuid.test(expected.id) || expected.lei_id !== lawId || row.lei_id !== lawId || row.ordem !== expected.ordem ||
      row.identificacao !== expected.identificacao || row.preparado_em !== expected.preparado_em ||
      row.legislacao_atualizada_em !== expected.legislacao_atualizada_em || row.structure_id !== expected.structure_id ||
      expected.situacao !== "preparada" || row.situacao !== expected.situacao || hash(row.legislacao) !== expected.legislacao_sha256)
      return reject(expected, "versão/estado diverge da revisão");
    const ordem = /^(\d+)\.0\.(?:\d+)\.[a-z0]\.\d+\.[a-z0]$/i.exec(row.ordem);
    const labelArticle = /^Art(?:igo)?(?:\.\s*|\s+)(\d+)/i.exec(row.identificacao);
    const article = ordem ? Number(ordem[1]) : null;
    if (article === null || Number(labelArticle?.[1]) !== article || articleOwners.get(article) !== expected.proposed_structure_id)
      return reject(expected, "artigo/estrutura não aprovados");
    const shippedHtml = sanitizeLegalHtmlCore(row.legislacao).trim();
    const headings = [...legalHtmlToStructuredText(shippedHtml).matchAll(/^\s*Art(?:igo)?\.\s*(\d+)\b/gim)].map((m) => Number(m[1]));
    if (!shippedHtml || headings.some((heading) => heading !== article)) return reject(expected, "bloco vazio ou artigo misto");
    return { ...expected, pin: scopedReadingDigest({ id: row.id, lawId, structureId: expected.proposed_structure_id,
      order: row.ordem, label: row.identificacao, changedAt: row.legislacao_atualizada_em === null ? null : new Date(row.legislacao_atualizada_em).toISOString(),
      rawHtml: row.legislacao, shippedHtml }) };
  });
  if (new Set(blocks.map((b) => Number(b.ordem.split(".")[0]))).size !== articleOwners.size) throw new Error("O lote não representa todos os artigos esperados.");
  const roots = [...new Set(articleOwners.values())].sort((a, b) => a - b);
  if (!roots.length || roots.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("Raízes inválidas.");
  const payload = JSON.stringify(blocks);
  if (payload.includes("$reviewed_blocks$")) throw new Error("Delimitador inválido no lote.");
  return `-- REVIEW ONLY. Apply only on the independently verified intended environment.
begin;
create temporary table scoped_reading_seed_stage on commit drop as
select * from jsonb_to_recordset($reviewed_blocks$${payload}$reviewed_blocks$::jsonb) as x(
  id uuid, lei_id bigint, ordem text, identificacao text, preparado_em timestamptz,
  legislacao_atualizada_em timestamptz, situacao text, structure_id bigint,
  legislacao_sha256 text, proposed_structure_id bigint, pin text
);
do $seed$
declare
  selected_scope uuid := '${scopeId}';
  target_law bigint := ${lawId};
  wanted bigint := ${expectedCount};
  updated bigint;
begin
  perform 1 from public.leis l where l.id = target_law and l.ativo and l.status_publicacao = 'ativa' for update;
  if not found then raise exception 'Lei não está ativa/publicada'; end if;
  perform 1 from public.recortes_leis s where s.id = selected_scope and s.lei_id = target_law and s.ativo and s.status_publicacao = 'ativa' and s.acesso_gratuito for update;
  if not found then raise exception 'Recorte gratuito não está ativo/publicado'; end if;
  perform 1 from public.recortes_leis_estrutura e where e.recorte_id = selected_scope for update;
  if (select array_agg(e.structure_id order by e.structure_id) from public.recortes_leis_estrutura e
      where e.recorte_id = selected_scope and e.lei_id = target_law) is distinct from array[${roots.join(", ")}]::bigint[]
    or (select count(*) from public.recortes_leis_estrutura e where e.recorte_id = selected_scope) <> ${roots.length}
    or (select count(*) from public.law_structure s where s.lei_id = target_law and s.ativo and s.id = any(array[${roots.join(", ")}]::bigint[])) <> ${roots.length}
  then raise exception 'As raízes do recorte mudaram'; end if;
  update public.legislative_references r set structure_id = p.proposed_structure_id
    from pg_temp.scoped_reading_seed_stage p where r.id = p.id and r.lei_id = target_law and p.lei_id = target_law
      and r.ordem = p.ordem and r.identificacao = p.identificacao
      and r.preparado_em = p.preparado_em and r.situacao = p.situacao
      and r.legislacao_atualizada_em is not distinct from p.legislacao_atualizada_em
      and (r.structure_id is not distinct from p.structure_id or r.structure_id = p.proposed_structure_id)
      and encode(sha256(convert_to(r.legislacao,'UTF8')), 'hex') = p.legislacao_sha256;
  get diagnostics updated = row_count;
  if updated <> wanted then raise exception 'Versão editorial divergente: % de %', updated, wanted; end if;
  insert into public.scoped_reading_certificates(recorte_id, reference_id, lei_id, structure_id, format_version, sha256)
    select selected_scope, id, target_law, proposed_structure_id, 1, pin from pg_temp.scoped_reading_seed_stage
    on conflict (recorte_id, reference_id) do nothing;
  if (select count(*) from public.scoped_reading_certificates c join pg_temp.scoped_reading_seed_stage p
      on p.id = c.reference_id and p.pin = c.sha256 and p.proposed_structure_id = c.structure_id
      where c.recorte_id = selected_scope and c.lei_id = target_law and c.format_version = 1 and c.revoked_at is null) <> wanted
    or (select count(*) from public.scoped_reading_certificates c where c.recorte_id = selected_scope and c.revoked_at is null) <> wanted
  then raise exception 'Certificação difere da revisão/contagem'; end if;
end
$seed$;
commit;
`;
}
