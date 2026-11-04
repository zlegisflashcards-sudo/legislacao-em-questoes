"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

const colors = ["azul", "verde", "lilas", "amarelo", "laranja", "vermelho", "coral", "turquesa"] as const;
type Color = (typeof colors)[number];
type Shortcut = { leiId: number; slug: string; titulo: string; recorteId: string | null; recorteNome: string | null; cor: Color; temAcesso: boolean };
type Selection = { id: string; nome: string; leis: Shortcut[] };
type Data = { minhaSelecao: Selection; selecoesProntas: Selection[]; leisDisponiveis: Shortcut[] };
const colorClass: Record<Color, string> = {
  azul: "from-sky-100 to-blue-200 text-blue-950 before:bg-blue-400",
  verde: "from-emerald-100 to-lime-200 text-emerald-950 before:bg-lime-500",
  lilas: "from-violet-100 to-purple-200 text-violet-950 before:bg-violet-500",
  amarelo: "from-amber-100 to-yellow-200 text-amber-950 before:bg-amber-400",
  laranja: "from-orange-100 to-amber-200 text-orange-950 before:bg-orange-500",
  vermelho: "from-red-100 to-rose-200 text-red-950 before:bg-red-600",
  coral: "from-rose-100 to-orange-200 text-rose-950 before:bg-rose-500",
  turquesa: "from-cyan-100 to-teal-200 text-cyan-950 before:bg-teal-400",
};
const colorDotClass: Record<Color, string> = { azul: "bg-blue-500", verde: "bg-lime-500", lilas: "bg-violet-500", amarelo: "bg-amber-400", laranja: "bg-orange-500", vermelho: "bg-red-600", coral: "bg-rose-500", turquesa: "bg-teal-400" };

async function authorizedFetch(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  return fetch(path, { ...init, headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json", ...init?.headers } });
}

function hrefFor(shortcut: Shortcut) {
  return shortcut.recorteId
    ? `/estudar/lei/${encodeURIComponent(shortcut.slug)}?recorte_id=${encodeURIComponent(shortcut.recorteId)}`
    : `/estudar/lei/${encodeURIComponent(shortcut.slug)}?contexto=completo`;
}

export function StudentShortcutsClient({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState("pessoal");
  const [option, setOption] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectionName, setSelectionName] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authorizedFetch("/api/aluno/atalhos", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/conta?modo=login&retorno=%2Fmeu-edital"); return; }
      const body = await response.json() as Data & { message?: string };
      if (!response.ok) throw new Error(body.message || "Não foi possível carregar seus atalhos.");
      setData(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível carregar seus atalhos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (data) setSelectionName(data.minhaSelecao.nome); }, [data]);

  const current = useMemo(() => selected === "pessoal" ? data?.minhaSelecao ?? null : data?.selecoesProntas.find((item) => item.id === selected) ?? null, [data, selected]);
  const options = useMemo(() => data?.leisDisponiveis ?? [], [data]);
  async function updatePersonal(action: string, payload: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const response = await authorizedFetch("/api/aluno/editais", { method: "PATCH", body: JSON.stringify({ action, ...payload }) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Não foi possível atualizar seus atalhos.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar seus atalhos."); }
    finally { setSaving(false); }
  }
  async function setColor(lawId: number, cor: Color) {
    setSaving(true); setError("");
    try {
      const response = await authorizedFetch("/api/aluno/atalhos", { method: "PATCH", body: JSON.stringify({ leiId: lawId, cor }) });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "Não foi possível atualizar a cor.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível atualizar a cor."); }
    finally { setSaving(false); }
  }
  async function move(lawId: number, direction: number) {
    const laws = data?.minhaSelecao.leis ?? []; const index = laws.findIndex((law) => law.leiId === lawId); const target = index + direction;
    if (target < 0 || target >= laws.length) return;
    const ids = laws.map((law) => law.leiId); [ids[index], ids[target]] = [ids[target], ids[index]];
    await updatePersonal("reorder", { leiIds: ids });
  }
  function add() {
    const shortcut = options.find((item) => `${item.leiId}:${item.recorteId ?? ""}` === option);
    if (!shortcut) return;
    const existing = data?.minhaSelecao.leis.find((item) => item.leiId === shortcut.leiId);
    if (existing && !window.confirm("Esta lei já está nos seus atalhos. Deseja trocar o contexto pelo selecionado?")) return;
    void updatePersonal("add", { leiId: shortcut.leiId, recorteId: shortcut.recorteId, confirmReplace: Boolean(existing) });
  }
  function renamePersonal() {
    const name = selectionName.trim();
    if (!name) { setSelectionName(data?.minhaSelecao.nome ?? "Minha seleção"); return; }
    if (name !== data?.minhaSelecao.nome) void updatePersonal("rename", { nome: name });
  }

  const Wrapper = embedded ? "section" : "main";
  return <Wrapper className={embedded ? "w-full" : "mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12"}>
    <header className="rounded-3xl border border-rose-100 bg-gradient-to-br from-white via-rose-50 to-amber-50 p-5 shadow-sm sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-700">Legis Flashcards</p><h1 className="mt-2 text-3xl font-black tracking-tight text-[#3b164f] sm:text-4xl">🔖 Meus Atalhos</h1><p className="mt-2 text-sm text-slate-600 sm:text-base">Organize seu estudo da legislação com etiquetas.</p></header>
    {loading ? <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">Carregando seus atalhos…</p> : null}
    {error ? <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p> : null}
    {data && !loading ? <section className="mt-6"><div className="flex flex-col gap-3 sm:flex-row"><select aria-label="Adicionar lei ou recorte aos meus atalhos" value={option} onChange={(event) => setOption(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"><option value="">Adicionar lei ou recorte…</option>{options.map((law) => <option key={`${law.leiId}:${law.recorteId ?? ""}`} value={`${law.leiId}:${law.recorteId ?? ""}`}>{law.titulo}{law.recorteNome ? ` — ${law.recorteNome}` : ""}</option>)}</select><button type="button" disabled={!option || saving} onClick={add} className="min-h-11 rounded-xl bg-[#f26352] px-5 font-black text-white shadow-sm transition hover:bg-[#e55141] disabled:opacity-50">＋ Adicionar lei</button></div>
      <div className="mt-6 flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between"><button type="button" aria-pressed={selected === "pessoal"} onClick={() => setSelected("pessoal")} className={`min-h-11 self-start border-b-2 px-4 text-sm font-black ${selected === "pessoal" ? "border-rose-500 text-rose-700" : "border-transparent text-slate-600 hover:text-rose-700"}`}>Minha seleção</button><label className="flex min-w-0 flex-col gap-1 text-sm font-black text-slate-700 sm:flex-row sm:items-center"><span className="whitespace-nowrap">Sugestões de organização:</span><select aria-label="Selecionar um edital sugerido" value={selected === "pessoal" ? "" : selected} onChange={(event) => setSelected(event.target.value || "pessoal")} className="min-h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"><option value="">Escolher edital</option>{data.selecoesProntas.map((selection) => <option key={selection.id} value={selection.id}>{selection.nome}</option>)}</select></label></div>
      {selected === "pessoal" ? <label className="mt-4 block max-w-md text-sm font-black text-slate-700">Nome da sua seleção<input aria-label="Nome da sua seleção" value={selectionName} disabled={saving} onChange={(event) => setSelectionName(event.target.value)} onBlur={renamePersonal} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} maxLength={80} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100" /></label> : null}
      {current ? <div role="tabpanel" className="mt-5"><h2 className="sr-only">{current.nome}</h2><div className="grid gap-3">{current.leis.map((law, index) => <ShortcutTag key={`${law.leiId}:${law.recorteId ?? "completa"}`} shortcut={law} editable={selected === "pessoal"} first={index === 0} last={index === current.leis.length - 1} disabled={saving} onColor={setColor} onMove={move} onRemove={() => void updatePersonal("remove", { leiId: law.leiId })} />)}</div>{!current.leis.length ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">Escolha uma lei acima para criar seu primeiro atalho.</p> : null}</div> : null}
    </section> : null}
  </Wrapper>;
}

function ShortcutTag({ shortcut, editable, first, last, disabled, onColor, onMove, onRemove }: { shortcut: Shortcut; editable: boolean; first: boolean; last: boolean; disabled: boolean; onColor(lawId: number, color: Color): Promise<void>; onMove(index: number, direction: number): Promise<void>; onRemove(): void }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const label = `${shortcut.titulo}${shortcut.recorteNome ? ` — ${shortcut.recorteNome}` : ""}`;
  const content = <><span className="grid h-8 w-6 shrink-0 place-items-center text-slate-500" aria-hidden="true">⠿</span><span className="min-w-0 flex-1 break-words text-base font-black sm:text-lg">{label}</span>{!shortcut.temAcesso ? <span className="shrink-0 text-base" title="Acesso não disponível" aria-label="Acesso não disponível">🔒</span> : <span className="shrink-0 text-lg" aria-hidden="true">→</span>}</>;
  const tagClass = `relative flex min-h-14 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r px-4 shadow-sm transition hover:-translate-y-px hover:shadow-md before:absolute before:inset-y-2 before:right-0 before:w-3 before:translate-x-1 ${colorClass[shortcut.cor]}`;
  const tag = shortcut.temAcesso ? <Link href={hrefFor(shortcut)} prefetch={false} className={tagClass}>{content}</Link> : <div className={`${tagClass} opacity-90`}>{content}</div>;
  return <div className="flex min-w-0 items-stretch gap-2"><MobileShortcutGesture disabled={disabled || !editable} onRemove={onRemove} onColor={() => setPaletteOpen(true)} onMove={onMove} lawId={shortcut.leiId}>{tag}{paletteOpen ? <div className="absolute bottom-full right-0 z-10 mb-2 grid w-32 grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{colors.map((color) => <button key={color} type="button" disabled={disabled} onClick={() => { setPaletteOpen(false); void onColor(shortcut.leiId, color); }} aria-label={`Usar ${color} em ${label}`} className={`grid h-8 w-8 place-items-center rounded-full ring-2 ring-offset-2 ${shortcut.cor === color ? "ring-slate-800" : "ring-transparent"}`}><span className={`h-5 w-5 rounded-full ${colorDotClass[color]}`} /></button>)}</div> : null}</MobileShortcutGesture><div className="hidden min-w-0 flex-1 sm:flex">{tag}</div>
    {editable ? <><div className="hidden shrink-0 items-center gap-1 sm:flex"><select aria-label={`Cor de ${label}`} value={shortcut.cor} disabled={disabled} onChange={(event) => void onColor(shortcut.leiId, event.target.value as Color)} className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-1 text-xs font-bold text-slate-700"><option value="azul">Azul</option><option value="verde">Verde</option><option value="lilas">Lilás</option><option value="amarelo">Amarelo</option><option value="laranja">Laranja</option><option value="vermelho">Vermelho</option><option value="coral">Coral</option><option value="turquesa">Turquesa</option></select><button type="button" disabled={disabled || first} onClick={() => void onMove(shortcut.leiId, -1)} aria-label={`Mover ${label} para cima`} className="grid h-10 w-9 place-items-center rounded-lg border border-slate-300 bg-white font-black text-slate-700 disabled:opacity-35">↑</button><button type="button" disabled={disabled || last} onClick={() => void onMove(shortcut.leiId, 1)} aria-label={`Mover ${label} para baixo`} className="grid h-10 w-9 place-items-center rounded-lg border border-slate-300 bg-white font-black text-slate-700 disabled:opacity-35">↓</button><button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remover ${label}`} className="grid h-10 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-sm text-slate-600 hover:text-red-700 disabled:opacity-35">×</button></div><div className="sr-only sm:hidden"><button type="button" onClick={() => setPaletteOpen(true)}>Escolher cor de {label}</button><button type="button" disabled={first} onClick={() => void onMove(shortcut.leiId, -1)}>Mover {label} para cima</button><button type="button" disabled={last} onClick={() => void onMove(shortcut.leiId, 1)}>Mover {label} para baixo</button><button type="button" onClick={onRemove}>Remover {label}</button></div></> : null}</div>;
}

function MobileShortcutGesture({ children, disabled, lawId, onRemove, onColor, onMove }: { children: React.ReactNode; disabled: boolean; lawId: number; onRemove(): void; onColor(): void; onMove(lawId: number, direction: number): Promise<void> }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const threshold = 72;
  function reset() { setDragging(false); setOffset({ x: 0, y: 0 }); }
  function completeGesture(x: number, y: number) {
    const origin = start.current;
    start.current = null;
    if (!origin || disabled) { reset(); return false; }
    const horizontal = x - origin.x;
    const vertical = y - origin.y;
    if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < threshold) { reset(); return false; }
    suppressClick.current = true;
    if (Math.abs(horizontal) > Math.abs(vertical)) {
      if (horizontal < 0) onRemove(); else onColor();
    } else void onMove(lawId, vertical < 0 ? -1 : 1);
    reset();
    return true;
  }
  const horizontal = Math.abs(offset.x) > Math.abs(offset.y);
  const revealRemove = horizontal && offset.x < -20;
  const revealColor = horizontal && offset.x > 20;
  return <div className="relative min-w-0 flex-1 overflow-visible sm:hidden" style={{ touchAction: "none" }} onPointerDown={(event) => { if (disabled) return; start.current = { x: event.clientX, y: event.clientY }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const origin = start.current; if (!origin) return; event.preventDefault(); const x = Math.max(-112, Math.min(112, event.clientX - origin.x)); const y = Math.max(-72, Math.min(72, event.clientY - origin.y)); setOffset({ x, y }); }} onPointerUp={(event) => { const changed = completeGesture(event.clientX, event.clientY); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (changed) event.preventDefault(); }} onPointerCancel={() => { start.current = null; reset(); }} onClickCapture={(event) => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); } }}>
    <div aria-hidden="true" className={`absolute inset-y-1 right-0 flex w-28 items-center justify-end rounded-2xl bg-red-100 pr-4 text-sm font-black text-red-700 transition-opacity ${revealRemove ? "opacity-100" : "opacity-0"}`}>🗑 Remover</div>
    <div aria-hidden="true" className={`absolute inset-y-1 left-0 flex w-28 items-center rounded-2xl bg-violet-100 pl-4 text-sm font-black text-violet-800 transition-opacity ${revealColor ? "opacity-100" : "opacity-0"}`}>🎨 Cores</div>
    <div className="relative z-10" style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, transition: dragging ? "none" : "transform 160ms ease" }}>{children}</div>
  </div>;
}
