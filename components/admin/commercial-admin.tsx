"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type PageResult = { items: Row[]; page: number; pages: number; total: number };
type Tab = "alunos" | "leis" | "materiais" | "produtos" | "aquisicoes" | "liberacoes" | "atualizacoes" | "auditoria";

const TABS: { id: Tab; label: string }[] = [
  { id: "alunos", label: "Alunos" },
  { id: "leis", label: "Leis" }, { id: "materiais", label: "Materiais" },
  { id: "produtos", label: "Produtos" }, { id: "aquisicoes", label: "Aquisições" },
  { id: "liberacoes", label: "Liberações" }, { id: "atualizacoes", label: "Atualizações" },
  { id: "auditoria", label: "Auditoria" },
];
const UPDATE_TYPES = ["alteracao_legislativa", "nova_versao_flashcards", "novas_questoes", "correcao_questoes", "correcao_flashcards", "melhoria_material", "outro"];
const IMPORTANCE = ["informativa", "recomendada", "essencial"];
const ORIGENS = ["hotmart", "cortesia", "amostra", "premiacao", "migracao", "administrativo"];
const ORIGENS_MANUAIS = ORIGENS.filter((item) => item !== "hotmart");
const text = (value: unknown) => value == null ? "" : String(value);
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const relation = (row: Row, key: string) => object(row[key]);
const date = (value: unknown) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))) : "—";

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Não foi possível concluir a operação.");
  return data;
}

function StudentSearch({ onSelect }: { onSelect: (student: Row) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search() {
    if (query.trim().length < 3) return setItems([]);
    setBusy(true); setError("");
    try { setItems((await requestJson(`/api/admin/comercial/alunos?q=${encodeURIComponent(query)}&limit=10`)).items ?? []); }
    catch (caught) { setItems([]); setError(caught instanceof Error ? caught.message : "Não foi possível buscar alunos."); }
    finally { setBusy(false); }
  }
  return <div className="commercial-student-search">
    <label>Buscar aluno por nome, e-mail ou UUID<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <button type="button" className="admin-button secondary" onClick={search} disabled={busy || query.trim().length < 3}>{busy ? "Buscando…" : "Buscar aluno"}</button>
    {items.length ? <div className="commercial-search-results">{items.map((item) => <button type="button" key={text(item.id)} onClick={() => { onSelect(item); setItems([]); }}>
      <strong>{text(item.nome) || text(item.nome_publico) || "Sem nome"}</strong><span>{text(item.email)} · {text(item.id)}</span>
    </button>)}</div> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
  </div>;
}

export default function CommercialAdmin() {
  const [tab, setTab] = useState<Tab>("leis");
  const [result, setResult] = useState<PageResult>({ items: [], page: 1, pages: 1, total: 0 });
  const [laws, setLaws] = useState<Row[]>([]);
  const [materials, setMaterials] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [student, setStudent] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (query.trim()) params.set("q", query.trim());
      for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
      setResult(await requestJson(`/api/admin/comercial/${tab}?${params}`));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha na consulta."); }
    finally { setBusy(false); }
  }, [filters, page, query, tab]);

  const loadReferences = useCallback(async () => {
    try {
      const [lawData, productData, materialData] = await Promise.all([
        requestJson("/api/admin/comercial/leis?limit=50&ativo=true"),
        requestJson("/api/admin/comercial/produtos?limit=50"),
        requestJson("/api/admin/comercial/materiais?limit=50"),
      ]);
      setLaws(lawData.items ?? []); setProducts(productData.items ?? []); setMaterials(materialData.items ?? []);
    } catch { /* A consulta principal exibira falhas relevantes. */ }
  }, []);

  useEffect(() => { if (tab !== "alunos") void load(); }, [load, tab]);
  useEffect(() => { void loadReferences(); }, [loadReferences]);

  async function mutate(resource: Tab, payload: Row, success: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      await requestJson(`/api/admin/comercial/${resource}`, { method: "POST", body: JSON.stringify(payload) });
      setMessage(success); setEditing(null); await Promise.all([load(), loadReferences()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Falha na operação."); }
    finally { setBusy(false); }
  }

  function choose(next: Tab) { setTab(next); setPage(1); setQuery(""); setFilters({}); setEditing(null); setMessage(""); setError(""); }
  function submitSearch(event: FormEvent) { event.preventDefault(); setPage(1); void load(); }
  const selectedProduct = useMemo(() => products.find((item) => text(item.id) === filters.produto_id), [filters.produto_id, products]);
  const selectedProductLawCount = Array.isArray(selectedProduct?.leis) ? selectedProduct.leis.length : 0;

  return <section className="commercial-admin">
    <nav className="commercial-tabs" aria-label="Seções comerciais">{TABS.map((item) => <button type="button" key={item.id} className={tab === item.id ? "active" : ""} onClick={() => choose(item.id)}>{item.label}</button>)}</nav>
    {message ? <div className="admin-alert success" role="status">{message}</div> : null}
    {error ? <div className="admin-alert error" role="alert">{error}</div> : null}

    <form className="commercial-toolbar" onSubmit={submitSearch}>
      {tab !== "liberacoes" && tab !== "alunos" ? <label>Busca<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar registros" /></label> : null}
      {tab === "materiais" ? <label>Lei<select value={filters.lei_id ?? ""} onChange={(event) => setFilters({ ...filters, lei_id: event.target.value })}><option value="">Todas</option>{laws.map((law) => <option key={text(law.id)} value={text(law.id)}>{text(law.titulo)}</option>)}</select></label> : null}
      {tab === "atualizacoes" ? <><label>Lei<select value={filters.lei_id ?? ""} onChange={(event) => setFilters({ ...filters, lei_id: event.target.value })}><option value="">Todas</option>{laws.map((law) => <option key={text(law.id)} value={text(law.id)}>{text(law.titulo)}</option>)}</select></label><label>Tipo<select value={filters.tipo ?? ""} onChange={(event) => setFilters({ ...filters, tipo: event.target.value })}><option value="">Todos</option>{UPDATE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Importância<select value={filters.importancia ?? ""} onChange={(event) => setFilters({ ...filters, importancia: event.target.value })}><option value="">Todas</option>{IMPORTANCE.map((item) => <option key={item}>{item}</option>)}</select></label></> : null}
      {tab === "leis" ? <label>Estado<select value={filters.ativo ?? ""} onChange={(event) => setFilters({ ...filters, ativo: event.target.value })}><option value="">Todas</option><option value="true">Ativas</option><option value="false">Inativas</option></select></label> : null}
      {tab === "aquisicoes" ? <><label>Status<select value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option><option value="ativo">Ativo</option><option value="cancelado">Cancelado</option><option value="reembolsado">Reembolsado</option></select></label><label>Origem<select value={filters.origem ?? ""} onChange={(event) => setFilters({ ...filters, origem: event.target.value })}><option value="">Todas</option>{ORIGENS.map((item) => <option key={item}>{item}</option>)}</select></label></> : null}
      {tab === "auditoria" ? <><label>Ator (UUID)<input value={filters.ator_user_id ?? ""} onChange={(event) => setFilters({ ...filters, ator_user_id: event.target.value })} /></label><label>Ação<input value={filters.acao ?? ""} onChange={(event) => setFilters({ ...filters, acao: event.target.value })} /></label><label>Entidade<input value={filters.entidade ?? ""} onChange={(event) => setFilters({ ...filters, entidade: event.target.value })} /></label><label>De<input type="datetime-local" value={filters.de ?? ""} onChange={(event) => setFilters({ ...filters, de: event.target.value })} /></label><label>Até<input type="datetime-local" value={filters.ate ?? ""} onChange={(event) => setFilters({ ...filters, ate: event.target.value })} /></label></> : null}
      {tab !== "liberacoes" && tab !== "alunos" ? <button className="admin-button secondary" disabled={busy}>Filtrar</button> : null}
    </form>

    {tab === "alunos" ? <StudentsPanel /> : null}
    {tab === "leis" ? <LawPanel rows={result.items} editing={editing} setEditing={setEditing} busy={busy} mutate={mutate} /> : null}
    {tab === "materiais" ? <MaterialPanel rows={result.items} laws={laws} editing={editing} setEditing={setEditing} busy={busy} mutate={mutate} /> : null}
    {tab === "produtos" ? <ProductPanel rows={result.items} laws={laws} editing={editing} setEditing={setEditing} busy={busy} mutate={mutate} /> : null}
    {tab === "aquisicoes" ? <AcquisitionPanel rows={result.items} student={student} setStudent={(item) => { setStudent(item); setFilters({ ...filters, aluno_id: text(item.id) }); setPage(1); }} products={products} filters={filters} setFilters={setFilters} lawCount={selectedProductLawCount} busy={busy} mutate={mutate} /> : null}
    {tab === "liberacoes" ? <ReleasePanel rows={result.items} student={student} setStudent={(item) => { setStudent(item); setFilters({ aluno_id: text(item.id) }); setPage(1); }} laws={laws} busy={busy} mutate={mutate} reload={load} /> : null}
    {tab === "atualizacoes" ? <EditorialUpdatesPanel rows={result.items} laws={laws} materials={materials} editing={editing} setEditing={setEditing} busy={busy} mutate={mutate} /> : null}
    {tab === "auditoria" ? <AuditPanel rows={result.items} /> : null}
    {busy ? <p className="commercial-loading">Carregando…</p> : null}
    <footer className="commercial-pagination"><span>{result.total} registro(s)</span><button type="button" disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{page} / {result.pages}</span><button type="button" disabled={busy || page >= result.pages} onClick={() => setPage(page + 1)}>Próxima</button></footer>
  </section>;
}

type PanelProps = { rows: Row[]; editing: Row | null; setEditing: (row: Row | null) => void; busy: boolean; mutate: (resource: Tab, payload: Row, success: string) => Promise<void> };

function StudentsPanel() {
  const [student, setStudent] = useState<Row | null>(null);
  const [acquisitions, setAcquisitions] = useState<Row[]>([]);
  const [releases, setReleases] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function selectStudent(nextStudent: Row) {
    setStudent(nextStudent); setAcquisitions([]); setReleases([]); setBusy(true); setError("");
    const alunoId = encodeURIComponent(text(nextStudent.id));
    try {
      const [acquisitionData, releaseData] = await Promise.all([
        requestJson(`/api/admin/comercial/aquisicoes?aluno_id=${alunoId}&limit=50`),
        requestJson(`/api/admin/comercial/liberacoes?aluno_id=${alunoId}&limit=50`),
      ]);
      setAcquisitions(acquisitionData.items ?? []);
      setReleases(releaseData.items ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar os dados do aluno.");
    } finally { setBusy(false); }
  }

  return <section className="commercial-card">
    <h2>Consultar aluno</h2>
    <StudentSearch onSelect={selectStudent} />
    {!student ? <p>Pesquise um aluno por nome ou e-mail para consultar suas aquisições e leis liberadas.</p> : null}
    {busy ? <p className="commercial-loading">Carregando dados do aluno…</p> : null}
    {error ? <div className="admin-alert error" role="alert">{error}</div> : null}
    {student && !busy && !error ? <>
      <p className="commercial-selection"><strong>Aluno:</strong> {text(student.nome) || text(student.nome_publico) || "Sem nome"} ({text(student.email)})</p>
      <h3>Aquisições</h3>
      {acquisitions.length ? <DataTable headers={["Produto", "Origem", "Data da aquisição", "Status"]}>{acquisitions.map((row) => <tr key={text(row.id)}><td>{text(relation(row, "produtos").nome) || "Produto não informado"}</td><td>{text(row.origem)}</td><td>{date(row.adquirida_em)}</td><td>{text(row.status_acesso)}</td></tr>)}</DataTable> : <p>Nenhuma aquisição encontrada para este aluno.</p>}
      <h3>Leis liberadas</h3>
      {releases.length ? <DataTable headers={["Lei", "Origem", "Produto", "Status da liberação"]}>{releases.map((row) => <tr key={text(row.id)}><td>{text(relation(row, "leis").titulo)}</td><td>{text(row.origem)}</td><td>{text(relation(row, "produtos").nome) || "—"}</td><td>{text(row.status)}</td></tr>)}</DataTable> : <p>Nenhuma lei liberada para este aluno.</p>}
    </> : null}
  </section>;
}

function LawPanel({ rows, editing, setEditing, busy, mutate }: PanelProps) {
  const [hasChange, setHasChange] = useState(editing?.houve_alteracao_legislativa === true);
  useEffect(() => setHasChange(editing?.houve_alteracao_legislativa === true), [editing]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await mutate("leis", { action: editing ? "atualizar" : "criar", id: editing?.id, data: { ...data, ordem: Number(data.ordem), ativo: data.ativo === "true", houve_alteracao_legislativa: data.houve_alteracao_legislativa === "true" } }, "Lei salva com sucesso."); if (!editing) event.currentTarget.reset(); }
  return <><EditForm key={text(editing?.id) || "new"} title={editing ? "Editar lei" : "Cadastrar lei"} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy}>
    <input name="slug" defaultValue={text(editing?.slug)} placeholder="slug-da-lei" required /><input name="titulo" defaultValue={text(editing?.titulo)} placeholder="Título" required />
    <input name="nome_curto" defaultValue={text(editing?.nome_curto)} placeholder="Nome curto" /><input name="codigo" defaultValue={text(editing?.codigo)} placeholder="Código" />
    <input name="categoria" defaultValue={text(editing?.categoria)} placeholder="Categoria" /><input name="thumbnail_url" defaultValue={text(editing?.thumbnail_url)} placeholder="URL da miniatura" />
    <textarea name="descricao" defaultValue={text(editing?.descricao)} placeholder="Descrição" /><input name="ordem" type="number" min="0" defaultValue={text(editing?.ordem) || "0"} required />
    <select name="ativo" defaultValue={editing?.ativo === false ? "false" : "true"}><option value="true">Ativa</option><option value="false">Inativa</option></select>
    <label>Norma originária<input name="norma_originaria_referencia" defaultValue={text(editing?.norma_originaria_referencia)} placeholder="Ex.: Lei nº 10.230/2015" /></label>
    <label>Data da norma originária<input name="norma_originaria_data" type="date" defaultValue={text(editing?.norma_originaria_data)} /></label>
    <label>Houve alteração legislativa?<select name="houve_alteracao_legislativa" value={hasChange ? "true" : "false"} onChange={(event) => setHasChange(event.target.value === "true")}><option value="false">Não</option><option value="true">Sim</option></select></label>
    {hasChange ? <><label>Última alteração incorporada<input name="ultima_alteracao_referencia" defaultValue={text(editing?.ultima_alteracao_referencia)} required /></label><label>Data da última alteração<input name="ultima_alteracao_data" type="date" defaultValue={text(editing?.ultima_alteracao_data)} required /></label></> : <><input type="hidden" name="ultima_alteracao_referencia" value="" /><input type="hidden" name="ultima_alteracao_data" value="" /></>}
    <label>Situação de atualização<select name="situacao_atualizacao" defaultValue={text(editing?.situacao_atualizacao) || "revisao_pendente"}>{["atualizado","revisao_pendente","desatualizado","em_revisao"].map((item) => <option key={item}>{item}</option>)}</select></label>
  </EditForm><DataTable headers={["Lei", "Referência normativa", "Situação", "Estado", "Ações"]}>{rows.map((row) => <tr key={text(row.id)}><td><strong>{text(row.titulo)}</strong><small>{text(row.slug)}</small></td><td><strong>{row.houve_alteracao_legislativa ? "Última alteração incorporada" : "Norma originária"}</strong><small>{text(row.houve_alteracao_legislativa ? row.ultima_alteracao_referencia : row.norma_originaria_referencia) || "—"}</small></td><td>{text(row.situacao_atualizacao)}</td><td>{row.ativo ? "Ativa" : "Inativa"}</td><td><button onClick={() => setEditing(row)}>Editar</button><button disabled={busy} onClick={() => void mutate("leis", { action: "atualizar", id: row.id, data: { ativo: !row.ativo } }, "Estado da lei atualizado.")}>{row.ativo ? "Desativar" : "Ativar"}</button></td></tr>)}</DataTable></>;
}

function MaterialPanel({ rows, laws, editing, setEditing, busy, mutate }: PanelProps & { laws: Row[] }) {
  const [kind, setKind] = useState(text(editing?.tipo) || "flashcards");
  useEffect(() => setKind(text(editing?.tipo) || "flashcards"), [editing]);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await mutate("materiais", { action: editing ? "atualizar" : "criar", id: editing?.id, data: { ...data, ...(editing ? {} : { lei_id: Number(data.lei_id) }), ordem: Number(data.ordem), ativo: data.ativo === "true", quantidade_itens: data.quantidade_itens === "" ? null : Number(data.quantidade_itens) } }, "Material salvo com sucesso."); }
  return <><EditForm key={text(editing?.id) || "new"} title={editing ? "Editar material" : "Cadastrar material"} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy}>
    {!editing ? <select name="lei_id" required defaultValue=""><option value="" disabled>Selecione a lei</option>{laws.map((law) => <option key={text(law.id)} value={text(law.id)}>{text(law.titulo)}</option>)}</select> : null}
    <select name="tipo" value={kind} onChange={(event) => setKind(event.target.value)}>{["flashcards","video","pdf","tutorial","audio","outro"].map((item) => <option key={item}>{item}</option>)}</select>
    <input name="titulo" defaultValue={text(editing?.titulo)} placeholder="Título" required /><textarea name="descricao" defaultValue={text(editing?.descricao)} placeholder="Descrição" />
    <select name="provedor" defaultValue={text(editing?.provedor) || "google_drive"}>{["google_drive","youtube","externo","supabase_storage"].map((item) => <option key={item}>{item}</option>)}</select>
    <input name="url_externa" type="url" defaultValue={text(editing?.url_externa)} placeholder="URL externa" required /><select name="acao" defaultValue={text(editing?.acao) || "abrir"}>{["abrir","baixar","assistir"].map((item) => <option key={item}>{item}</option>)}</select>
    <label>{kind === "flashcards" ? "Quantidade de flashcards" : "Quantidade de itens"}<input name="quantidade_itens" type="number" min="0" defaultValue={text(editing?.quantidade_itens)} /></label>
    <label>Versão do material<input name="versao_material" defaultValue={text(editing?.versao_material)} /></label><label>Data de revisão<input name="revisado_em" type="date" defaultValue={text(editing?.revisado_em)} /></label><label>Data de publicação<input name="publicado_em" type="date" defaultValue={text(editing?.publicado_em)} /></label>
    <textarea name="observacao_interna" defaultValue={text(editing?.observacao_interna)} placeholder="Observação interna — nunca exibida ao aluno ou catálogo" />
    <input name="ordem" type="number" min="0" defaultValue={text(editing?.ordem) || "0"} required /><select name="ativo" defaultValue={editing?.ativo === false ? "false" : "true"}><option value="true">Ativo</option><option value="false">Inativo</option></select>
  </EditForm><DataTable headers={["Material", "Lei", "Versão / quantidade", "Estado", "Ações"]}>{rows.map((row) => <tr key={text(row.id)}><td><strong>{text(row.titulo)}</strong><small><a href={text(row.url_externa)} target="_blank" rel="noreferrer">Abrir URL administrativa</a></small></td><td>{text(relation(row,"leis").titulo)}</td><td>{text(row.versao_material) || "—"}<small>{row.quantidade_itens == null ? "Quantidade não informada" : `${text(row.quantidade_itens)} ${row.tipo === "flashcards" ? "flashcards" : "itens"}`}</small></td><td>{row.ativo ? "Ativo" : "Inativo"}</td><td><button onClick={() => setEditing(row)}>Editar</button><button disabled={busy} onClick={() => void mutate("materiais", { action: "atualizar", id: row.id, data: { ativo: !row.ativo } }, "Estado do material atualizado.")}>{row.ativo ? "Desativar" : "Ativar"}</button></td></tr>)}</DataTable></>;
}

function ProductPanel({ rows, laws, editing, setEditing, busy, mutate }: PanelProps & { laws: Row[] }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); await mutate("produtos", { action: editing ? "atualizar" : "criar", id: editing?.id, data: { ...data, ordem: Number(data.ordem), ativo: data.ativo === "true" } }, "Produto salvo com sucesso."); }
  return <><EditForm key={text(editing?.id) || "new"} title={editing ? "Editar produto" : "Cadastrar produto"} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy}>
    <input name="nome" defaultValue={text(editing?.nome)} placeholder="Nome" required /><input name="slug" defaultValue={text(editing?.slug)} placeholder="slug-do-produto" required />
    <textarea name="descricao" defaultValue={text(editing?.descricao)} placeholder="Descrição" /><select name="tipo_produto" defaultValue={text(editing?.tipo_produto) || "lei_avulsa"}>{["lei_avulsa","combo","edital","assinatura","outro"].map((item) => <option key={item}>{item}</option>)}</select>
    <input name="hotmart_url" type="url" defaultValue={text(editing?.hotmart_url)} placeholder="URL Hotmart opcional" /><input name="hotmart_product_id" defaultValue={text(editing?.hotmart_product_id)} placeholder="ID Hotmart opcional" />
    <textarea name="observacao_administrativa" defaultValue={text(editing?.observacao_administrativa)} placeholder="Observação administrativa" /><input name="ordem" type="number" min="0" defaultValue={text(editing?.ordem) || "0"} required />
    <select name="ativo" defaultValue={editing?.ativo === false ? "false" : "true"}><option value="true">Ativo</option><option value="false">Inativo</option></select>
  </EditForm>{editing ? <CompositionEditor key={text(editing.id)} product={editing} laws={laws} busy={busy} mutate={mutate} /> : null}
  <DataTable headers={["Produto", "Tipo", "Leis", "Estado", "Ações"]}>{rows.map((row) => <tr key={text(row.id)}><td><strong>{text(row.nome)}</strong><small>{text(row.slug)}</small></td><td>{text(row.tipo_produto)}</td><td>{Array.isArray(row.leis) ? row.leis.length : 0}</td><td>{row.ativo ? "Ativo" : "Inativo"}</td><td><button onClick={() => setEditing(row)}>Editar / composição</button><button disabled={busy} onClick={() => void mutate("produtos", { action: "atualizar", id: row.id, data: { ativo: !row.ativo } }, "Estado do produto atualizado.")}>{row.ativo ? "Desativar" : "Ativar"}</button></td></tr>)}</DataTable></>;
}

function CompositionEditor({ product, laws, busy, mutate }: { product: Row; laws: Row[]; busy: boolean; mutate: PanelProps["mutate"] }) {
  const initial = Array.isArray(product.leis) ? product.leis.map((item) => text(object(item).lei_id)) : [];
  const [selected, setSelected] = useState(initial);
  const [candidate, setCandidate] = useState("");
  const title = (id: string) => text(laws.find((law) => text(law.id) === id)?.titulo) || `Lei ${id}`;
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected]; [next[index], next[target]] = [next[target], next[index]]; setSelected(next);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await mutate("produtos", { action: "definir_leis", id: product.id, lei_ids: selected.map(Number) }, "Composição ordenada atualizada sem efeito retroativo.");
  }
  return <form className="commercial-composition" onSubmit={save}>
    <h3>Leis do produto</h3><p>Ordene com as setas. Alterar esta composição não cria liberações retroativas.</p>
    <div className="commercial-composition-add"><select value={candidate} onChange={(event) => setCandidate(event.target.value)}><option value="">Adicionar lei…</option>{laws.filter((law) => !selected.includes(text(law.id))).map((law) => <option key={text(law.id)} value={text(law.id)}>{text(law.titulo)}</option>)}</select><button type="button" className="admin-button secondary" disabled={!candidate} onClick={() => { setSelected([...selected, candidate]); setCandidate(""); }}>Adicionar</button></div>
    <ol>{selected.map((id, index) => <li key={id}><span>{title(id)}</span><div><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover ${title(id)} para cima`}>↑</button><button type="button" disabled={index === selected.length - 1} onClick={() => move(index, 1)} aria-label={`Mover ${title(id)} para baixo`}>↓</button><button type="button" onClick={() => setSelected(selected.filter((item) => item !== id))}>Remover</button></div></li>)}</ol>
    <button className="admin-button primary" disabled={busy}>Salvar composição</button>
  </form>;
}

function AcquisitionPanel({ rows, student, setStudent, products, filters, setFilters, lawCount, busy, mutate }: { rows: Row[]; student: Row | null; setStudent: (row: Row) => void; products: Row[]; filters: Record<string,string>; setFilters: (filters: Record<string,string>) => void; lawCount: number; busy: boolean; mutate: PanelProps["mutate"] }) {
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!student) return; const data=Object.fromEntries(new FormData(event.currentTarget)); const product=products.find((item)=>text(item.id)===text(data.produto_id)); if (!window.confirm(`Confirmar aquisição?\nAluno: ${text(student.nome)} (${text(student.email)})\nProduto: ${text(product?.nome)}\nOrigem: ${text(data.origem)}\nLeis liberadas: ${lawCount}`)) return; await mutate("aquisicoes", { action:"registrar", data:{ ...data, aluno_id:student.id } }, "Aquisição registrada e liberações criadas."); }
  async function lifecycle(row: Row, action: string) { if (!window.confirm(`Confirmar ${action} desta aquisição? O histórico será preservado.`)) return; await mutate("aquisicoes", { action, id:row.id }, `Aquisição ${action === "reativar" ? "reativada" : action === "cancelar" ? "cancelada" : "reembolsada"}.`); }
  return <><div className="commercial-card"><h2>Registrar aquisição</h2><StudentSearch onSelect={setStudent} />{student ? <p className="commercial-selection"><strong>Aluno:</strong> {text(student.nome)} ({text(student.email)})</p> : null}<form className="commercial-form-grid" onSubmit={submit}><select name="produto_id" required value={filters.produto_id ?? ""} onChange={(event)=>setFilters({...filters,produto_id:event.target.value})}><option value="" disabled>Selecione o produto</option>{products.filter((item)=>item.ativo).map((item)=><option key={text(item.id)} value={text(item.id)}>{text(item.nome)}</option>)}</select><select name="origem" defaultValue="administrativo">{ORIGENS.map((item)=><option key={item}>{item}</option>)}</select><input name="identificador_externo" placeholder="Identificador externo opcional" /><textarea name="observacao_administrativa" placeholder="Observação administrativa" /><p>Composição atual: <strong>{lawCount} lei(s)</strong>.</p><button className="admin-button primary" disabled={busy || !student || !filters.produto_id}>Registrar aquisição</button></form></div>
  <DataTable headers={["Aluno", "Produto", "Origem", "Status", "Data", "Ações"]}>{rows.map((row)=><tr key={text(row.id)}><td>{text(relation(row,"alunos").nome)}<small>{text(relation(row,"alunos").email)}</small></td><td>{text(relation(row,"produtos").nome)}</td><td>{text(row.origem)}</td><td>{text(row.status_acesso)}</td><td>{date(row.adquirida_em)}</td><td>{row.status_acesso === "ativo" ? <><button disabled={busy} onClick={()=>void lifecycle(row,"cancelar")}>Cancelar</button><button disabled={busy} onClick={()=>void lifecycle(row,"reembolsar")}>Reembolsar</button></> : <button disabled={busy} onClick={()=>void lifecycle(row,"reativar")}>Reativar histórico</button>}</td></tr>)}</DataTable></>;
}

function ReleasePanel({ rows, student, setStudent, laws, busy, mutate, reload }: { rows: Row[]; student: Row|null; setStudent:(row:Row)=>void; laws:Row[]; busy:boolean; mutate:PanelProps["mutate"]; reload:()=>Promise<void> }) {
  useEffect(()=>{ if(student) void reload(); },[student,reload]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!student)return;const data=Object.fromEntries(new FormData(event.currentTarget));await mutate("liberacoes",{action:"conceder",data:{...data,aluno_id:student.id,lei_id:Number(data.lei_id)}},"Lei concedida manualmente.");}
  async function revoke(row:Row){if(!window.confirm("Revogar somente esta fonte de acesso? O histórico será preservado."))return;await mutate("liberacoes",{action:"revogar",id:row.id,data:{motivo:"Revogação administrativa"}},"Liberação revogada.");}
  return <><div className="commercial-card"><h2>Consultar e conceder</h2><StudentSearch onSelect={setStudent}/>{student?<><p className="commercial-selection"><strong>Aluno:</strong> {text(student.nome)} ({text(student.email)})</p><form className="commercial-form-grid" onSubmit={submit}><select name="lei_id" required defaultValue=""><option value="" disabled>Selecione a lei</option>{laws.map((law)=><option key={text(law.id)} value={text(law.id)}>{text(law.titulo)}</option>)}</select><select name="origem" defaultValue="administrativo">{ORIGENS_MANUAIS.map((item)=><option key={item}>{item}</option>)}</select><input name="motivo" placeholder="Motivo"/><button className="admin-button primary" disabled={busy}>Conceder lei</button></form></>:null}</div>
  <DataTable headers={["Lei","Fonte","Status","Concedida","Outras fontes","Ações"]}>{rows.map((row)=><tr key={text(row.id)}><td>{text(relation(row,"leis").titulo)}</td><td>{text(row.origem)}<small>{text(relation(row,"produtos").nome)}</small></td><td>{text(row.status)}</td><td>{date(row.concedida_em)}</td><td>{Number(row.outras_fontes_ativas||0)>0?`${text(row.outras_fontes_ativas)} ativa(s)`:"Nenhuma"}</td><td>{row.status==="ativo"?<button disabled={busy} onClick={()=>void revoke(row)}>Revogar esta fonte</button>:"—"}</td></tr>)}</DataTable></>;
}

const optionalNumber = (value: FormDataEntryValue | undefined) => value == null || value === "" ? null : Number(value);

function EditorialUpdatesPanel({ rows, laws, materials, editing, setEditing, busy, mutate }: PanelProps & { laws: Row[]; materials: Row[] }) {
  const [lawId, setLawId] = useState(text(editing?.lei_id));
  useEffect(() => setLawId(text(editing?.lei_id)), [editing]);
  const lawMaterials = materials.filter((item) => !lawId || text(item.lei_id) === lawId);
  const flashcardMaterials = materials.filter((item) => item.tipo === "flashcards");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const data: Row = {
      ...raw,
      ...(editing ? {} : { lei_id: Number(raw.lei_id) }),
      material_lei_id: raw.material_lei_id ? Number(raw.material_lei_id) : null,
      visivel_aluno: raw.visivel_aluno === "true",
      visivel_catalogo: raw.visivel_catalogo === "true",
    };
    for (const key of ["quantidade_flashcards_anterior","quantidade_flashcards_nova","quantidade_questoes_adicionadas","quantidade_questoes_corrigidas","quantidade_flashcards_revisados"]) data[key] = optionalNumber(raw[key]);
    await mutate("atualizacoes", { action: editing ? "atualizar" : "criar", id: editing?.id, data }, "Atualização editorial salva.");
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    if (!window.confirm("Publicar a nova versão completa? A URL e a versão vigentes serão substituídas atomicamente; não haverá pacote incremental.")) return;
    await mutate("atualizacoes", { action: "publicar_versao", data: {
      ...raw,
      material_lei_id: Number(raw.material_lei_id),
      nova_quantidade_itens: Number(raw.nova_quantidade_itens),
      quantidade_questoes_adicionadas: optionalNumber(raw.quantidade_questoes_adicionadas),
      quantidade_questoes_corrigidas: optionalNumber(raw.quantidade_questoes_corrigidas),
      quantidade_flashcards_revisados: optionalNumber(raw.quantidade_flashcards_revisados),
      visivel_aluno: raw.visivel_aluno === "true",
      visivel_catalogo: raw.visivel_catalogo === "true",
    } }, "Nova versão completa publicada e registrada no histórico.");
  }
  async function hide(row: Row) {
    if (!window.confirm("Ocultar esta atualização do aluno e do catálogo? O registro e a auditoria serão preservados.")) return;
    await mutate("atualizacoes", { action: "ocultar", id: row.id }, "Atualização ocultada sem exclusão do histórico.");
  }
  return <>
    <EditForm key={text(editing?.id) || "new-update"} title={editing ? "Editar atualização editorial" : "Registrar atualização editorial"} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy}>
      {!editing ? <label>Lei<select name="lei_id" required value={lawId} onChange={(event) => setLawId(event.target.value)}><option value="" disabled>Selecione a lei</option>{laws.map((law) => <option key={text(law.id)} value={text(law.id)}>{text(law.titulo)}</option>)}</select></label> : <p><strong>Lei:</strong> {text(relation(editing,"leis").titulo)}</p>}
      <label>Material relacionado<select name="material_lei_id" defaultValue={text(editing?.material_lei_id)}><option value="">Nenhum</option>{lawMaterials.map((item) => <option key={text(item.id)} value={text(item.id)}>{text(item.titulo)} ({text(item.tipo)})</option>)}</select></label>
      <label>Tipo<select name="tipo" defaultValue={text(editing?.tipo) || "melhoria_material"}>{UPDATE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Importância<select name="importancia" defaultValue={text(editing?.importancia) || "informativa"}>{IMPORTANCE.map((item) => <option key={item}>{item}</option>)}</select></label>
      <input name="titulo" defaultValue={text(editing?.titulo)} placeholder="Título da atualização" required /><textarea name="descricao_resumida" defaultValue={text(editing?.descricao_resumida)} placeholder="Descrição resumida" />
      <input name="referencia_normativa" defaultValue={text(editing?.referencia_normativa)} placeholder="Norma relacionada" /><label>Data da norma<input name="data_referencia_normativa" type="date" defaultValue={text(editing?.data_referencia_normativa)} /></label>
      <input name="versao_anterior" defaultValue={text(editing?.versao_anterior)} placeholder="Versão anterior" /><input name="versao_nova" defaultValue={text(editing?.versao_nova)} placeholder="Nova versão" />
      <input name="quantidade_flashcards_anterior" type="number" min="0" defaultValue={text(editing?.quantidade_flashcards_anterior)} placeholder="Flashcards anteriores" /><input name="quantidade_flashcards_nova" type="number" min="0" defaultValue={text(editing?.quantidade_flashcards_nova)} placeholder="Flashcards atuais" />
      <input name="quantidade_questoes_adicionadas" type="number" min="0" defaultValue={text(editing?.quantidade_questoes_adicionadas)} placeholder="Questões adicionadas" /><input name="quantidade_questoes_corrigidas" type="number" min="0" defaultValue={text(editing?.quantidade_questoes_corrigidas)} placeholder="Questões corrigidas" /><input name="quantidade_flashcards_revisados" type="number" min="0" defaultValue={text(editing?.quantidade_flashcards_revisados)} placeholder="Flashcards revisados" />
      <label>Visível ao aluno<select name="visivel_aluno" defaultValue={editing?.visivel_aluno === false ? "false" : "true"}><option value="true">Sim</option><option value="false">Não</option></select></label><label>Visível no catálogo<select name="visivel_catalogo" defaultValue={editing?.visivel_catalogo === true ? "true" : "false"}><option value="false">Não</option><option value="true">Sim</option></select></label>
      <label>Data de publicação<input name="data_publicacao" type="datetime-local" defaultValue={text(editing?.data_publicacao).slice(0,16)} /></label><textarea name="observacao_interna" defaultValue={text(editing?.observacao_interna)} placeholder="Observação interna — nunca exposta ao aluno ou catálogo" />
    </EditForm>
    <form className="commercial-card commercial-form-grid" onSubmit={publish}>
      <h2>Publicar nova versão completa de flashcards</h2><p>Substitui o arquivo oficial vigente e registra histórico e auditoria na mesma transação. Não cria pacote incremental, GUID ou merge de deck.</p>
      <select name="material_lei_id" required defaultValue=""><option value="" disabled>Selecione o material de flashcards</option>{flashcardMaterials.map((item) => <option key={text(item.id)} value={text(item.id)}>{text(relation(item,"leis").titulo)} — {text(item.titulo)}</option>)}</select>
      <input name="nova_url_externa" type="url" placeholder="Nova URL administrativa do arquivo completo" required /><input name="nova_versao" placeholder="Nova versão" required /><input name="nova_quantidade_itens" type="number" min="0" placeholder="Nova quantidade de flashcards" required />
      <label>Revisado em<input name="revisado_em" type="date" required /></label><label>Publicado em<input name="publicado_em" type="date" required /></label><select name="tipo_atualizacao" defaultValue="nova_versao_flashcards">{UPDATE_TYPES.map((item) => <option key={item}>{item}</option>)}</select><select name="importancia" defaultValue="recomendada">{IMPORTANCE.map((item) => <option key={item}>{item}</option>)}</select>
      <input name="titulo" placeholder="Título da atualização" required /><textarea name="descricao_resumida" placeholder="Descrição resumida" /><input name="referencia_normativa" placeholder="Norma relacionada" /><input name="data_referencia_normativa" type="date" />
      <input name="quantidade_questoes_adicionadas" type="number" min="0" placeholder="Questões adicionadas" /><input name="quantidade_questoes_corrigidas" type="number" min="0" placeholder="Questões corrigidas" /><input name="quantidade_flashcards_revisados" type="number" min="0" placeholder="Flashcards revisados" />
      <select name="visivel_aluno" defaultValue="true"><option value="true">Visível ao aluno</option><option value="false">Oculto do aluno</option></select><select name="visivel_catalogo" defaultValue="false"><option value="false">Oculto do catálogo</option><option value="true">Visível no catálogo</option></select><textarea name="observacao_interna" placeholder="Observação interna" />
      <button className="admin-button primary" disabled={busy}>Publicar versão completa</button>
    </form>
    <DataTable headers={["Atualização", "Lei / material", "Importância", "Visibilidade", "Publicação", "Ações"]}>{rows.map((row) => <tr key={text(row.id)}><td><strong>{text(row.titulo)}</strong><small>{text(row.tipo)}</small></td><td>{text(relation(row,"leis").titulo)}<small>{text(relation(row,"materiais_leis").titulo)}</small></td><td>{text(row.importancia)}</td><td>Aluno: {row.visivel_aluno ? "sim" : "não"}<small>Catálogo: {row.visivel_catalogo ? "sim" : "não"}</small></td><td>{date(row.data_publicacao || row.created_at)}</td><td><button onClick={() => setEditing(row)}>Editar</button><button disabled={busy || (!row.visivel_aluno && !row.visivel_catalogo)} onClick={() => void hide(row)}>Ocultar</button></td></tr>)}</DataTable>
  </>;
}

function AuditPanel({rows}:{rows:Row[]}){return <DataTable headers={["Data","Ator","Ação","Entidade","Detalhes"]}>{rows.map((row)=><tr key={text(row.id)}><td>{date(row.created_at)}</td><td>{text(row.ator_user_id)||"Sistema"}</td><td>{text(row.acao)}</td><td>{text(row.entidade)}<small>{text(row.entidade_id)}</small></td><td><details><summary>Ver alterações</summary><pre>{JSON.stringify({anterior:row.estado_anterior,posterior:row.estado_posterior,detalhes:row.detalhes},null,2)}</pre></details></td></tr>)}</DataTable>}

function EditForm({title,onSubmit,onCancel,busy,children}:{title:string;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onCancel:()=>void;busy:boolean;children:React.ReactNode}){return <form className="commercial-card commercial-form-grid" onSubmit={onSubmit}><h2>{title}</h2>{children}<div className="commercial-form-actions"><button className="admin-button primary" disabled={busy}>Salvar</button><button type="button" className="admin-button secondary" onClick={onCancel}>Novo / cancelar edição</button></div></form>}
function DataTable({headers,children}:{headers:string[];children:React.ReactNode}){return <div className="admin-table-wrap commercial-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header)=><th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}
