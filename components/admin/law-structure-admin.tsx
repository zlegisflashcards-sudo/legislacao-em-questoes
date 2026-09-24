"use client";

import { useRef, useState } from "react";
import { allAnkiPathsForQuestionStructure, ankiPathForQuestionStructure, compareQuestionStructureNames, creatableQuestionStructureTypes, validQuestionStructureParent, type CreatableQuestionStructureType, type QuestionStructureType } from "@/lib/questoes-structure";

export type AdminLawStructureKind = QuestionStructureType;
export type AdminLawStructureNode = { id: number; parent_id: number | null; tipo: AdminLawStructureKind; nome: string; ordem: number; pdf_page?: number | null };
type Creation = { tipo: CreatableQuestionStructureType; parentId: number | null; nome: string; ordem: string };
type Edition = { id: number; nome: string; ordem: string; pdfPage: string };
type DeletionCampaign = { id: string; aluno_id: string; nome: string | null; email: string | null; is_requesting_admin: boolean };
type DeletionDependency = { id: string | number; title?: string | null; name?: string | null; status?: string | null };
type DeletionSummary = { id: number; name: string; type: AdminLawStructureKind; questions_count: number; structures_count: number; substructures_count: number; campaigns_count: number; answers_count: number; progresses_count: number; campaigns: DeletionCampaign[]; requires_confirmation: boolean; dependencies_count: number; job_action_required?: "detach_completed" | "cancel_active" | null; jobs?: DeletionDependency[]; dependencies: { audios: DeletionDependency[]; jobs: DeletionDependency[]; recortes: DeletionDependency[]; cross_law: Array<DeletionDependency & { kind?: string; lei_id?: number }> } };
type StructureImportPreview = { items: Array<{ key: string; parent_key: string | null; line: number; path: string; nome: string; tipo: AdminLawStructureKind; status: "novo" | "existente" }>; conflicts: Array<{ line: number; path: string; message: string }>; summary: { novos: number; existentes: number; conflitos: number }; can_import: boolean };

const labels: Record<AdminLawStructureKind, string> = { parte: "Parte", livro: "Livro", titulo: "Título", capitulo: "Capítulo", secao: "Seção", subsecao: "Subseção", artigo: "Artigo" };
const creatableLabels = creatableQuestionStructureTypes;

async function api<T>(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/questoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro na operação estrutural.");
  return data as T;
}

export function LawStructureAdmin({ lawSlug, lawName, nodes, onReload, onSelectNode, onDeleteComplete, selectNodeLabel = "Cadastrar questão aqui" }: { lawSlug: string; lawName?: string; nodes: AdminLawStructureNode[]; onReload: () => Promise<void>; onSelectNode?: (node: AdminLawStructureNode) => void; onDeleteComplete?: (ids: number[]) => void; selectNodeLabel?: string }) {
  const [creating, setCreating] = useState<Creation | null>(null);
  const [editing, setEditing] = useState<Edition | null>(null);
  const [deleting, setDeleting] = useState<DeletionSummary | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<StructureImportPreview | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null);
  const [pendingSiblingOrders, setPendingSiblingOrders] = useState<Record<string, number[]>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const creatingRequest = useRef(false);
  const editingRequest = useRef(false);
  const siblingKey = (parentId: number | null) => parentId === null ? "root" : String(parentId);
  const kids = (parentId: number | null) => {
    const siblings = nodes.filter((node) => node.parent_id === parentId).sort(compareQuestionStructureNames);
    const intendedOrder = pendingSiblingOrders[siblingKey(parentId)];
    if (!intendedOrder) return siblings;
    const positions = new Map(intendedOrder.map((nodeId, index) => [nodeId, index]));
    return [...siblings].sort((left, right) => (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  };
  const ankiDeckName = lawName?.trim() || lawSlug;
  async function copy(value: string, label: string) {
    setError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard indisponível");
      await navigator.clipboard.writeText(value);
      setMessage(label);
    } catch { setError("Não foi possível copiar o caminho Anki neste navegador."); }
  }

  function startCreation(tipo: CreatableQuestionStructureType, parentId: number | null) {
    if (!saving && !creating && !editing) { setError(""); if (parentId) setCollapsed((current) => { const next = new Set(current); next.delete(parentId); return next; }); setCreating({ tipo, parentId, nome: "", ordem: String((kids(parentId).reduce((max, node) => Math.max(max, node.ordem), 0) || 0) + 1) }); }
  }
  async function saveCreation() {
    const pending = creating; const nome = pending?.nome.trim();
    if (!pending || !nome || saving || creatingRequest.current) return;
    creatingRequest.current = true; setSaving(true); setError("");
    try {
      await api({ action: "criar_estrutura", law_slug: lawSlug, tipo: pending.tipo, parent_id: pending.parentId, nome, ordem: pending.ordem });
      await onReload(); setCreating(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível salvar a estrutura."); }
    finally { creatingRequest.current = false; setSaving(false); }
  }
  async function saveEdition() {
    const pending = editing; const nome = pending?.nome.trim();
    if (!pending || !nome || saving || editingRequest.current) return;
    const pdfPage = pending.pdfPage.trim() ? Number(pending.pdfPage) : null;
    if (pdfPage !== null && (!Number.isSafeInteger(pdfPage) || pdfPage < 1)) { setError("A página do PDF deve ser um inteiro positivo."); return; }
    editingRequest.current = true; setSaving(true); setError("");
    try {
      const ordem = Number(pending.ordem);
      if (!Number.isSafeInteger(ordem) || ordem < 0) { setError("A posição deve ser um inteiro maior ou igual a zero."); return; }
      await api({ action: "atualizar_estrutura", law_slug: lawSlug, id: pending.id, nome, ordem, pdf_page: pdfPage });
      await onReload(); setEditing(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a estrutura."); }
    finally { editingRequest.current = false; setSaving(false); }
  }
  async function askDelete(node: AdminLawStructureNode) {
    setError(""); setDeleteConfirmation("");
    try { setDeleting(await api<DeletionSummary>({ action: "resumo_exclusao_estrutura", law_slug: lawSlug, id: node.id })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível analisar a exclusão."); }
  }
  async function confirmDelete() {
    if (!deleting) return; setSaving(true); setError("");
    const removedIds = new Set<number>();
    const visit = (id: number) => { removedIds.add(id); nodes.filter((node) => node.parent_id === id).forEach((node) => visit(node.id)); };
    visit(deleting.id);
    try { await api({ action: "excluir_estrutura", law_slug: lawSlug, id: deleting.id, confirmation: deleteConfirmation, job_action: deleting.job_action_required ?? null }); onDeleteComplete?.([...removedIds]); setDeleting(null); setDeleteConfirmation(""); await onReload(); setMessage("Estrutura, questões e campanhas afetadas excluídas definitivamente."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível excluir a estrutura."); }
    finally { setSaving(false); }
  }
  async function chooseImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setError(""); setImportPreview(null);
    if (!file) { setImportFileName(""); return; }
    if (!file.name.toLowerCase().endsWith(".txt")) { setError("Selecione um arquivo .txt."); event.target.value = ""; return; }
    if (file.size > 500_000) { setError("O arquivo TXT deve ter no máximo 500 KB."); event.target.value = ""; return; }
    try { setImportText(await file.text()); setImportFileName(file.name); }
    catch { setError("Não foi possível ler o arquivo TXT."); }
  }
  async function previewImport() {
    setSaving(true); setError(""); setMessage(""); setImportPreview(null);
    try { setImportPreview(await api<StructureImportPreview>({ action: "previsualizar_estrutura_txt", law_slug: lawSlug, text: importText })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível gerar a prévia da estrutura."); }
    finally { setSaving(false); }
  }
  async function confirmImport() {
    if (!importPreview?.can_import) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await api<{ criados: number }>({ action: "importar_estrutura_txt", law_slug: lawSlug, text: importText });
      await onReload(); setMessage(`${result.criados} nó(s) estrutural(is) importado(s).`); setImportOpen(false); setImportText(""); setImportFileName(""); setImportPreview(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível importar a estrutura."); }
    finally { setSaving(false); }
  }
  async function reorderSiblings(parentId: number | null, orderedIds: number[]) {
    if (saving) return;
    const key = siblingKey(parentId);
    const previousIds = kids(parentId).map((node) => node.id);
    setPendingSiblingOrders((current) => ({ ...current, [key]: orderedIds }));
    setSaving(true); setError(""); setMessage("");
    try {
      await api({ action: "reordenar_estruturas", law_slug: lawSlug, ids: orderedIds });
      await onReload(); setPendingSiblingOrders((current) => { const next = { ...current }; delete next[key]; return next; }); setMessage("Ordem das estruturas atualizada.");
    } catch (caught) { const reason = caught instanceof Error ? caught.message : "Não foi possível reordenar as estruturas."; setPendingSiblingOrders((current) => ({ ...current, [key]: previousIds })); setError(`${reason} A posição anterior foi restaurada.`); }
    finally { setSaving(false); setDraggedNodeId(null); }
  }
  function moveSibling(node: AdminLawStructureNode, direction: -1 | 1) {
    const siblings = kids(node.parent_id); const index = siblings.findIndex((sibling) => sibling.id === node.id); const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const ordered = siblings.map((sibling) => sibling.id); [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    void reorderSiblings(node.parent_id, ordered);
  }
  function dropSibling(target: AdminLawStructureNode) {
    if (draggedNodeId === null || draggedNodeId === target.id) return;
    const siblings = kids(target.parent_id); const sourceIndex = siblings.findIndex((sibling) => sibling.id === draggedNodeId); const targetIndex = siblings.findIndex((sibling) => sibling.id === target.id);
    if (sourceIndex < 0 || targetIndex < 0) { setError("Só é possível arrastar estruturas entre irmãs."); setDraggedNodeId(null); return; }
    const ordered = siblings.map((sibling) => sibling.id); const [source] = ordered.splice(sourceIndex, 1); ordered.splice(sourceIndex < targetIndex ? targetIndex - 1 : targetIndex, 0, source);
    void reorderSiblings(target.parent_id, ordered);
  }

  return <article className="commercial-card">
    <h2>Estrutura da legislação</h2>
    <p>A estrutura pertence à lei e pode ser cadastrada antes de questões ou arquivos Anki.</p>
    {message ? <p className="admin-alert success" role="status">{message}</p> : null}
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    <div className="flex flex-wrap gap-3">{creatableLabels.map((kind) => <button key={kind} type="button" className="admin-link-button" disabled={saving || Boolean(creating) || Boolean(editing)} onClick={() => startCreation(kind, null)}>+ {labels[kind]}</button>)}<button type="button" className="admin-link-button" disabled={saving || Boolean(creating) || Boolean(editing)} onClick={() => { setImportOpen((value) => !value); setImportPreview(null); setError(""); }}>Importar estrutura por TXT</button>{nodes.length ? <button type="button" className="admin-link-button" onClick={() => void copy(allAnkiPathsForQuestionStructure(ankiDeckName, nodes).join("\n"), "Todos os caminhos Anki foram copiados.")}>📋 Copiar todos os caminhos</button> : null}</div>
    {importOpen ? <section className="structure-txt-import" aria-labelledby="structure-txt-title"><div><h3 id="structure-txt-title">Importar estrutura por TXT</h3><p>Uma linha por caminho. Separe os níveis com <code>::</code>. A prévia não altera o banco.</p></div><label>Arquivo .txt<input type="file" accept=".txt,text/plain" disabled={saving} onChange={(event) => void chooseImportFile(event)} /></label>{importFileName ? <p><strong>Arquivo:</strong> {importFileName}</p> : null}<label>Conteúdo TXT<textarea value={importText} disabled={saving} placeholder={"TÍTULO I\nTÍTULO I::CAPÍTULO I\nTÍTULO I::CAPÍTULO I::SEÇÃO I"} onChange={(event) => { setImportText(event.target.value); setImportPreview(null); setImportFileName(""); }} /></label><div className="flex flex-wrap gap-2"><button type="button" className="admin-button secondary" disabled={saving || !importText.trim()} onClick={() => void previewImport()}>{saving ? "Analisando…" : "Gerar prévia"}</button><button type="button" className="admin-button secondary" disabled={saving} onClick={() => { setImportOpen(false); setImportPreview(null); }}>Cancelar</button></div>{importPreview ? <section className="anki-import-preview" aria-live="polite"><h3>Prévia da estrutura</h3><div className="anki-import-summary"><p className="new"><strong>Novos:</strong> {importPreview.summary.novos}</p><p className="duplicate"><strong>Existentes:</strong> {importPreview.summary.existentes}</p><p className="error"><strong>Conflitos:</strong> {importPreview.summary.conflitos}</p></div>{importPreview.conflicts.length ? <div><h4>Conflitos encontrados</h4><ul>{importPreview.conflicts.map((conflict, index) => <li key={`${conflict.line}-${index}`}><strong>{conflict.line ? `Linha ${conflict.line}` : "Arquivo"}:</strong> {conflict.message}{conflict.path ? ` — ${conflict.path}` : ""}</li>)}</ul></div> : null}{importPreview.items.length ? <details open><summary>Hierarquia resultante ({importPreview.items.length} nós)</summary><ul>{importPreview.items.map((item) => <li key={item.key}>{item.status === "novo" ? "+" : "✓"} {item.path} — {item.status === "novo" ? "será criado" : "já existe"}</li>)}</ul></details> : null}<button type="button" className="admin-button primary" disabled={saving || !importPreview.can_import} onClick={() => void confirmImport()}>{saving ? "Importando…" : importPreview.summary.novos ? `Confirmar importação de ${importPreview.summary.novos} nó(s)` : "Nenhum nó novo"}</button></section> : null}</section> : null}
    <StructureTree nodes={kids(null)} kids={kids} creating={creating} editing={editing} saving={saving} add={startCreation} changeCreation={setCreating} saveCreation={saveCreation} changeEdition={setEditing} saveEdition={saveEdition} selectNode={onSelectNode} selectNodeLabel={selectNodeLabel} onDelete={askDelete} onCopy={(node) => void copy(ankiPathForQuestionStructure(node.id, ankiDeckName, nodes), "Caminho Anki copiado.")} onMove={moveSibling} onDragStart={setDraggedNodeId} onDrop={dropSibling} collapsed={collapsed} toggleCollapsed={(nodeId) => setCollapsed((current) => { const next = new Set(current); if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId); return next; })} />
    {!nodes.length && !creating && !importOpen ? <div className="admin-empty law-center-empty"><h3>Comece pela estrutura da lei</h3><p>Crie uma Parte, Livro, Título ou Capítulo. Questões, áudios e recortes podem ser vinculados depois.</p><div className="flex flex-wrap gap-2"><button type="button" className="admin-button primary" onClick={() => startCreation("parte", null)}>Criar primeira Parte</button><button type="button" className="admin-button secondary" onClick={() => startCreation("titulo", null)}>Criar primeiro Título</button><button type="button" className="admin-button secondary" onClick={() => setImportOpen(true)}>Importar TXT</button></div></div> : null}
    {deleting ? <DeletionDialog summary={deleting} confirmation={deleteConfirmation} saving={saving} onConfirmation={setDeleteConfirmation} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} /> : null}
  </article>;
}

function StructureTree({ nodes, kids, parentId = null, creating, editing, saving, add, changeCreation, saveCreation, changeEdition, saveEdition, selectNode, selectNodeLabel, onDelete, onCopy, onMove, onDragStart, onDrop, collapsed, toggleCollapsed, depth = 0 }: { nodes: AdminLawStructureNode[]; kids: (id: number | null) => AdminLawStructureNode[]; parentId?: number | null; creating: Creation | null; editing: Edition | null; saving: boolean; add: (kind: CreatableQuestionStructureType, parent: number | null) => void; changeCreation: React.Dispatch<React.SetStateAction<Creation | null>>; saveCreation: () => Promise<void>; changeEdition: React.Dispatch<React.SetStateAction<Edition | null>>; saveEdition: () => Promise<void>; selectNode?: (node: AdminLawStructureNode) => void; selectNodeLabel: string; onDelete: (node: AdminLawStructureNode) => void; onCopy: (node: AdminLawStructureNode) => void; onMove: (node: AdminLawStructureNode, direction: -1 | 1) => void; onDragStart: (nodeId: number | null) => void; onDrop: (node: AdminLawStructureNode) => void; collapsed: Set<number>; toggleCollapsed: (nodeId: number) => void; depth?: number }) {
  const inputForCurrentParent = creating?.parentId === parentId ? creating : null;
  return <ul className="admin-questoes-structure">
    {nodes.map((node, index) => { const current = editing?.id === node.id ? editing : null; const hasChildren = kids(node.id).length > 0 || creating?.parentId === node.id; const isCollapsed = collapsed.has(node.id); return <li key={node.id} draggable={!saving && !current} onDragStart={() => onDragStart(node.id)} onDragEnd={() => onDragStart(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(node); }} style={{ marginLeft: depth * 18 }}>
      {hasChildren ? <button type="button" className="admin-structure-toggle" aria-label={isCollapsed ? `Ampliar ${node.nome}` : `Recolher ${node.nome}`} aria-expanded={!isCollapsed} title={isCollapsed ? "Ampliar subdecks" : "Recolher subdecks"} onClick={() => toggleCollapsed(node.id)}>{isCollapsed ? "+" : "−"}</button> : <span className="admin-structure-toggle-placeholder" aria-hidden="true" />}
      {current ? <div className="flex flex-wrap items-end gap-2">
        <label><strong>{labels[node.tipo]}</strong><input autoFocus aria-label={`Nome do ${labels[node.tipo]}`} value={current.nome} disabled={saving} onChange={(event) => changeEdition((value) => value ? { ...value, nome: event.target.value } : value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); changeEdition(null); } if (event.key === "Enter") { event.preventDefault(); if (current.nome.trim() && !saving) void saveEdition(); } }} /></label>
        <label>Posição<input type="number" min="0" inputMode="numeric" value={current.ordem} disabled={saving} onChange={(event) => changeEdition((value) => value ? { ...value, ordem: event.target.value } : value)} /></label>
        <label>Página PDF<input type="number" min="1" inputMode="numeric" value={current.pdfPage} disabled={saving} onChange={(event) => changeEdition((value) => value ? { ...value, pdfPage: event.target.value } : value)} /></label>
        <button type="button" disabled={saving || !current.nome.trim()} onClick={() => void saveEdition()}>{saving ? "Salvando…" : "Salvar"}</button>
        <button type="button" disabled={saving} onClick={() => changeEdition(null)}>Cancelar</button>
      </div> : <>
        <strong>{labels[node.tipo]}:</strong> {node.nome}{node.pdf_page ? ` · PDF p. ${node.pdf_page}` : ""}{" "}
        <button type="button" className="admin-link-button" aria-label={`Editar ${labels[node.tipo]} ${node.nome}`} title={`Editar ${labels[node.tipo].toLowerCase()}`} disabled={saving || Boolean(creating) || Boolean(editing)} onClick={() => changeEdition({ id: node.id, nome: node.nome, ordem: String(node.ordem), pdfPage: node.pdf_page ? String(node.pdf_page) : "" })}>✎</button>{" "}
        <button type="button" className="admin-link-button" aria-label={`Copiar caminho Anki de ${node.nome}`} title="Copiar caminho Anki" disabled={saving || Boolean(creating) || Boolean(editing)} onClick={() => onCopy(node)}>📋</button>
        <button type="button" className="admin-link-button" aria-label={`Mover ${node.nome} para cima`} title="Mover para cima" disabled={saving || index === 0 || Boolean(creating) || Boolean(editing)} onClick={() => onMove(node, -1)}>↑</button>
        <button type="button" className="admin-link-button" aria-label={`Mover ${node.nome} para baixo`} title="Mover para baixo" disabled={saving || index === nodes.length - 1 || Boolean(creating) || Boolean(editing)} onClick={() => onMove(node, 1)}>↓</button>
        {selectNode ? <button type="button" disabled={Boolean(editing)} onClick={() => selectNode(node)}>{selectNodeLabel}</button> : null}
      </>}
      {creatableLabels.filter((kind) => validQuestionStructureParent(kind, node.tipo)).map((kind) => <button key={kind} type="button" className="admin-link-button" aria-label={`Criar ${labels[kind]} como subdeck imediato`} title={`Criar ${labels[kind].toLowerCase()} como subdeck imediato`} disabled={saving || Boolean(creating) || Boolean(editing)} onClick={() => add(kind, node.id)}>＋</button>)}
      <button type="button" className="admin-link-button danger" aria-label={`Excluir ${labels[node.tipo]} ${node.nome}`} title="Excluir estrutura" disabled={saving || Boolean(creating) || Boolean(editing)} onClick={() => onDelete(node)}>🗑️</button>
      {!isCollapsed ? <StructureTree nodes={kids(node.id)} kids={kids} parentId={node.id} creating={creating} editing={editing} saving={saving} add={add} changeCreation={changeCreation} saveCreation={saveCreation} changeEdition={changeEdition} saveEdition={saveEdition} selectNode={selectNode} selectNodeLabel={selectNodeLabel} onDelete={onDelete} onCopy={onCopy} onMove={onMove} onDragStart={onDragStart} onDrop={onDrop} collapsed={collapsed} toggleCollapsed={toggleCollapsed} depth={depth + 1} /> : null}
    </li>; })}
    {inputForCurrentParent ? <li style={{ marginLeft: depth * 18 }}>
      <input autoFocus aria-label={`Nome do ${labels[inputForCurrentParent.tipo]}`} value={inputForCurrentParent.nome} disabled={saving} placeholder={`Nome do ${labels[inputForCurrentParent.tipo].toLowerCase()}...`} onChange={(event) => changeCreation((current) => current ? { ...current, nome: event.target.value } : current)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); changeCreation(null); } if (event.key === "Enter") { event.preventDefault(); if (inputForCurrentParent.nome.trim() && !saving) void saveCreation(); } }} />
      <label>Posição<input type="number" min="0" inputMode="numeric" aria-label={`Posição do ${labels[inputForCurrentParent.tipo]}`} value={inputForCurrentParent.ordem} disabled={saving} onChange={(event) => changeCreation((current) => current ? { ...current, ordem: event.target.value } : current)} /></label>
      <button type="button" disabled={saving || !inputForCurrentParent.nome.trim()} onClick={() => void saveCreation()}>{saving ? "Salvando…" : "Salvar"}</button>
      <button type="button" disabled={saving} onClick={() => changeCreation(null)}>Cancelar</button>
    </li> : null}
  </ul>;
}

function DeletionDialog({ summary, confirmation, saving, onConfirmation, onCancel, onConfirm }: { summary: DeletionSummary; confirmation: string; saving: boolean; onConfirmation: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const blocked = summary.dependencies_count > 0;
  const dependencies = [...summary.dependencies.audios.map((item) => `Áudio: ${item.title ?? item.id}`), ...summary.dependencies.recortes.map((item) => `Recorte: ${item.name ?? item.id}`), ...summary.dependencies.cross_law.map((item) => `Vínculo cruzado: ${item.kind ?? "registro"} ${item.id} da lei ${item.lei_id ?? "desconhecida"}`)];
  const jobs = summary.jobs ?? summary.dependencies.jobs;
  const jobLabel = summary.job_action_required === "cancel_active" ? "Cancelar processamento e excluir estrutura" : "Desvincular job e excluir estrutura";
  return <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="delete-structure-title"><h2 id="delete-structure-title">Excluir {labels[summary.type]} {summary.name}?</h2><p>A operação excluirá definitivamente <strong>{summary.structures_count} estrutura(s)</strong> ({summary.substructures_count} subestrutura(s)) e <strong>{summary.questions_count} questão(ões)</strong>.</p><p>Também serão apagadas integralmente <strong>{summary.campaigns_count} campanha(s)</strong>, {summary.answers_count} resposta(s) e serão atualizados {summary.progresses_count} progresso(s) vinculados.</p>{summary.campaigns.length ? <details open><summary>Campanhas e alunos afetados</summary><ul>{summary.campaigns.map((campaign) => <li key={campaign.id}>{campaign.nome || "Aluno sem nome"} ({campaign.email || campaign.aluno_id}){campaign.is_requesting_admin ? " · sua conta administrativa" : " · outro aluno"}</li>)}</ul></details> : null}{jobs.length ? <details open><summary>Jobs LegisCast vinculados</summary><ul>{jobs.map((job) => <li key={String(job.id)}><strong>{job.title || "Sem título"}</strong> · {job.status || "status desconhecido"} · <code>{job.id}</code></li>)}</ul></details> : null}{blocked ? <div className="admin-alert error" role="alert"><strong>Exclusão bloqueada.</strong><p>Mova ou desvincule estas dependências antes de tentar novamente:</p><ul>{dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}</ul></div> : null}{summary.requires_confirmation ? <label>Há campanha de outro aluno. Digite <strong>EXCLUIR</strong> para confirmar.<input autoFocus value={confirmation} disabled={saving || blocked} onChange={(event) => onConfirmation(event.target.value)} /></label> : null}<p className="admin-alert">Jobs encerrados serão somente desvinculados; jobs em fila ou processando serão cancelados de forma segura. Áudios, recortes e vínculos cruzados continuam bloqueando.</p><div className="admin-modal-actions"><button type="button" className="admin-button secondary" disabled={saving} onClick={onCancel}>Cancelar</button><button type="button" className="admin-button danger" disabled={saving || blocked || (summary.requires_confirmation && confirmation !== "EXCLUIR")} onClick={onConfirm}>{saving ? "Excluindo…" : summary.job_action_required ? jobLabel : "Excluir estrutura e campanhas afetadas"}</button></div></section></div>;
}
