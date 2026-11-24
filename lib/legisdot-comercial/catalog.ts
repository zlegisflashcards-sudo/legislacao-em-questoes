import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { SalesProduct } from "./types";

type Row = Record<string, unknown>;
const PAGE_SIZE = 400;
const MAX_PAGES = 25;
const MODULE_LABELS = {
  questoes: "Legis Questões",
  anki: "Anki",
  legiscast: "LegisCast",
  materiais: "PDF",
} as const;

function cleanText(value: unknown, maxLength = 240): string {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

/** Same canonical origin configuration used by the public product detail page. */
export function salesSiteOrigin(): string {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.legisflashcards.com.br");
    if (url.protocol === "https:" && !url.username && !url.password && url.hostname !== "offline.invalid") return url.origin;
  } catch { /* Invalid configuration never becomes a customer link. */ }
  return "https://www.legisflashcards.com.br";
}

/** Payment links are catalog data, never language-model output. */
export function safeSalesCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value.trim());
    // Keep the allowlist explicit: arbitrary tenants and lookalike domains are not checkout hosts.
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !["pay.hotmart.com", "hotmart.com", "www.hotmart.com"].includes(url.hostname)) return null;
    return url.toString();
  } catch { return null; }
}

export function salesPriceCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const number = typeof value === "number" ? value : Number(value.trim());
  const cents = Math.round(number * 100);
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(cents) &&
    Math.abs(number * 100 - cents) < 0.00001 ? cents : null;
}

function lawFromLink(link: Row): Row | null {
  const joined = Array.isArray(link.leis) ? link.leis[0] : link.leis;
  return joined !== null && typeof joined === "object" ? joined as Row : null;
}

function visible(row: Row | null): row is Row {
  return row !== null && row.ativo === true && ["ativa", "em_breve"].includes(String(row.status_publicacao));
}

/** Builds only the public commercial projection; never reads purchases or student records. */
export function buildSalesCatalog(input: {
  products: Row[];
  links: Row[];
  scopes: Row[];
  checks: Row[];
  origin?: string;
}): SalesProduct[] {
  const origin = input.origin ?? salesSiteOrigin();
  const linksByProduct = new Map<string, Row[]>();
  for (const link of input.links) {
    const id = String(link.produto_id ?? "");
    linksByProduct.set(id, [...(linksByProduct.get(id) ?? []), link]);
  }
  const scopesById = new Map(input.scopes.map((scope) => [String(scope.id), scope]));
  const checksByLaw = new Map<string, Set<string>>();
  for (const row of input.checks) {
    const key = String(row.lei_id ?? "");
    const set = checksByLaw.get(key) ?? new Set<string>();
    set.add(String(row.item));
    checksByLaw.set(key, set);
  }

  return input.products.flatMap((product): SalesProduct[] => {
    const id = cleanText(product.id, 100);
    const name = cleanText(product.nome);
    const slug = cleanText(product.slug, 160);
    if (product.ativo !== true || !id || !name || !slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return [];
    const links = linksByProduct.get(id) ?? [];
    const laws = links.map(lawFromLink);
    // Do not turn a partly unpublished bundle into an apparently complete offer.
    if (laws.some((law) => !visible(law))) return [];
    const linkedScopes = links.map((link) => link.recorte_id == null ? null : scopesById.get(String(link.recorte_id)) ?? null);
    if (links.some((link, index) => link.recorte_id != null &&
      (!visible(linkedScopes[index]) || String(linkedScopes[index]?.lei_id) !== String(link.lei_id)))) return [];

    const ready = links.length > 0 && laws.every((law) => law?.status_publicacao === "ativa") &&
      linkedScopes.every((scope) => scope === null || scope.status_publicacao === "ativa");
    const modules = ready ? Object.entries(MODULE_LABELS)
      .filter(([module]) => links.every((link) => checksByLaw.get(String(link.lei_id))?.has(module)))
      .map(([, label]) => label) : [];
    const onlyLaw = laws[0];
    const onlyScope = linkedScopes[0];
    const lawSlug = cleanText(onlyLaw?.slug, 100);
    const free = ready && product.tipo_produto === "lei_avulsa" && links.length === 1 &&
      /^[a-zA-Z0-9_-]+$/.test(lawSlug) &&
      (links[0].recorte_id == null ? onlyLaw?.acesso_gratuito === true : onlyScope?.acesso_gratuito === true);
    const scopeSuffix = free && links[0].recorte_id != null ? `?recorte_id=${encodeURIComponent(String(links[0].recorte_id))}` : "";

    return [{
      id,
      name,
      slug,
      description: cleanText(product.descricao, 700),
      priceCents: salesPriceCents(product.preco),
      checkoutUrl: ready && !free ? safeSalesCheckoutUrl(product.hotmart_url) : null,
      detailUrl: `${origin}/leisflashcards/${encodeURIComponent(slug)}`,
      freeStudyUrl: free ? `${origin}/estudar/lei/${encodeURIComponent(lawSlug)}${scopeSuffix}` : null,
      availability: ready ? "ready" : "coming_soon",
      modules,
      lawNames: [...new Set(laws.map((law) => cleanText(law?.titulo || law?.nome_curto)).filter(Boolean))],
    }];
  });
}

async function readPages(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (result.error) throw new Error("Não foi possível consultar o catálogo comercial.");
    const batch = result.data ?? [];
    rows.push(...batch.filter((row): row is Row => row !== null && typeof row === "object" && !Array.isArray(row)));
    if (batch.length < PAGE_SIZE) return rows;
  }
  throw new Error("O catálogo excede o limite seguro de carregamento.");
}

export async function loadSalesCatalog(): Promise<SalesProduct[]> {
  const db = getSupabaseServerClient();
  const products = await readPages((from, to) => db.from("produtos")
    .select("id,nome,slug,descricao,tipo_produto,preco,hotmart_url,ativo,ordem")
    .eq("ativo", true).not("slug", "is", null).order("ordem").order("id").range(from, to));
  if (!products.length) return [];
  const links: Row[] = [];
  // Batch IN filters to keep requests below proxy URL limits.
  for (let start = 0; start < products.length; start += 100) {
    const ids = products.slice(start, start + 100).map((row) => String(row.id));
    links.push(...await readPages((from, to) => db.from("produto_leis")
      .select("produto_id,lei_id,recorte_id,ordem,leis(id,slug,titulo,nome_curto,ativo,status_publicacao,acesso_gratuito)")
      .in("produto_id", ids).order("produto_id").order("lei_id").order("recorte_id").range(from, to)));
  }
  const lawIds = [...new Set(links.map((row) => String(row.lei_id)))];
  const scopeIds = [...new Set(links.flatMap((row) => typeof row.recorte_id === "string" ? [row.recorte_id] : []))];
  const checks: Row[] = [];
  const scopes: Row[] = [];
  for (let start = 0; start < lawIds.length; start += 100) {
    checks.push(...await readPages((from, to) => db.from("admin_law_overview_checks").select("lei_id,item")
      .in("lei_id", lawIds.slice(start, start + 100)).order("lei_id").order("item").range(from, to)));
  }
  for (let start = 0; start < scopeIds.length; start += 100) {
    scopes.push(...await readPages((from, to) => db.from("recortes_leis")
      .select("id,lei_id,ativo,status_publicacao,acesso_gratuito")
      .in("id", scopeIds.slice(start, start + 100)).order("id").range(from, to)));
  }
  return buildSalesCatalog({ products, links, scopes, checks });
}
