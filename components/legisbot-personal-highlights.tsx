"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_COLOR_LABELS,
  type HighlightColor,
  type HighlightSelection,
  type LegisBotHighlight,
} from "@/lib/legisbot-highlights";

type HighlightPaletteProps = {
  value: HighlightColor;
  onChange: (color: HighlightColor) => void;
  disabled?: boolean;
  label: string;
};

function HighlightPalette({ value, onChange, disabled = false, label }: HighlightPaletteProps) {
  return <div className="highlight-palette" role="radiogroup" aria-label={label}>
    {HIGHLIGHT_COLORS.map((option) => {
      const selected = value === option;
      const optionLabel = HIGHLIGHT_COLOR_LABELS[option];
      return <button
        key={option}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={optionLabel}
        title={optionLabel}
        className={`highlight-color-option ${selected ? "active" : ""}`}
        disabled={disabled}
        onClick={() => onChange(option)}
      >
        <span className={`highlight-color-swatch ${option}`} aria-hidden="true">
          {selected ? <span className="highlight-color-check">✓</span> : null}
        </span>
      </button>;
    })}
  </div>;
}

type HighlightsResponse = {
  success: boolean;
  message?: string;
  highlights?: LegisBotHighlight[];
  highlight?: LegisBotHighlight;
  replaced?: boolean;
};

type Props = {
  slug: string;
  ordem: string;
  legislationText: string;
  selectedHighlight: LegisBotHighlight | null;
  onHighlightsChange: (highlights: LegisBotHighlight[]) => void;
  onSelectedHighlightClear: () => void;
  selectionRootId: string;
  markerModeActive: boolean;
  onMarkerModeChange: (active: boolean) => void;
};

async function authHeaders(json = false): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

function selectionFromLegalText(root: HTMLElement, legislationText: string): HighlightSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().replace(/\u00a0/g, " ");
  if (!text.trim()) return null;

  // A posição visual é a melhor pista para textos repetidos. Se o HTML tiver
  // quebras estruturais que não existem no DOM, procuramos a ocorrência mais
  // próxima no texto canônico validado pelo servidor.
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const visualStart = before.toString().replace(/\u00a0/g, " ").length;
  const direct = legislationText.slice(visualStart, visualStart + text.length);
  if (direct === text) return { start: visualStart, end: visualStart + text.length, text };

  const matches: number[] = [];
  let cursor = legislationText.indexOf(text);
  while (cursor >= 0) {
    matches.push(cursor);
    cursor = legislationText.indexOf(text, cursor + 1);
  }
  if (!matches.length) return null;
  const start = matches.sort((first, second) => Math.abs(first - visualStart) - Math.abs(second - visualStart))[0];
  return { start, end: start + text.length, text };
}

export default function LegisBotPersonalHighlights({
  slug,
  ordem,
  legislationText,
  selectedHighlight,
  onHighlightsChange,
  onSelectedHighlightClear,
  selectionRootId,
  markerModeActive,
  onMarkerModeChange,
}: Props) {
  const [highlights, setHighlights] = useState<LegisBotHighlight[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [color, setColor] = useState<HighlightColor>("amarelo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorSelection, setSelectorSelection] = useState<HighlightSelection | null>(null);
  const [lastCreatedHighlight, setLastCreatedHighlight] = useState<LegisBotHighlight | null>(null);
  // A seleção feita em um `div` depende de como o navegador reconstitui
  // espaços e quebras do HTML. O servidor, porém, valida offsets contra o
  // texto canônico. Um textarea somente leitura mantém exatamente essa mesma
  // sequência de caracteres e expõe selectionStart/selectionEnd de forma
  // confiável no mouse e no toque.
  const selectionArea = useRef<HTMLTextAreaElement>(null);
  const returnPath = `/legisbot/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}`;
  const apiUrl = `/api/legisbot/${encodeURIComponent(slug)}/${encodeURIComponent(ordem)}/destaques`;

  const replaceHighlights = useCallback((next: LegisBotHighlight[]) => {
    const ordered = [...next].sort((a, b) => a.start - b.start);
    setHighlights(ordered);
    onHighlightsChange(ordered);
  }, [onHighlightsChange]);

  const loadWithToken = useCallback(async (token: string | null) => {
    setLoading(true);
    setMessage("");
    if (!token) {
      setAuthenticated(false);
      setLastCreatedHighlight(null);
      replaceHighlights([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(apiUrl, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const result = await response.json() as HighlightsResponse;
      if (response.status === 401) {
        setAuthenticated(false);
        replaceHighlights([]);
        return;
      }
      if (!response.ok || !result.success) throw new Error(result.message);
      setAuthenticated(true);
      replaceHighlights(result.highlights ?? []);
    } catch {
      setMessage("Não foi possível carregar seus destaques.");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [apiUrl, replaceHighlights]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) void loadWithToken(data.session?.access_token ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void loadWithToken(session?.access_token ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [loadWithToken]);

  const captureSelectorSelection = useCallback(() => {
    const area = selectionArea.current;
    if (!area || area.selectionStart === area.selectionEnd) {
      setSelectorSelection(null);
      return;
    }
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = legislationText.slice(start, end);
    setSelectorSelection(text.trim() ? { start, end, text } : null);
  }, [legislationText]);

  function closeSelector() {
    setSelectorOpen(false);
    setSelectorSelection(null);
  }

  async function createOrReplaceHighlight(targetSelection: HighlightSelection, keepMarkerMode = false) {
    if (!targetSelection || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({ ...targetSelection, color }),
      });
      const result = await response.json() as HighlightsResponse;
      if (!response.ok || !result.success || !result.highlight) {
        setMessage(result.message ?? "Não foi possível salvar o destaque.");
        return;
      }
      replaceHighlights([
        ...highlights.filter((item) => item.id !== result.highlight?.id),
        result.highlight,
      ]);
      setLastCreatedHighlight(response.status === 201 && !result.replaced ? result.highlight : null);
      window.getSelection()?.removeAllRanges();
      if (!keepMarkerMode) closeSelector();
      setMessage("Destaque salvo ✓");
    } catch {
      setMessage("Não foi possível salvar o destaque.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const root = document.getElementById(selectionRootId);
    if (!root) return;
    if (markerModeActive) root.dataset.highlightColor = color;
    else delete root.dataset.highlightColor;
    return () => { delete root.dataset.highlightColor; };
  }, [color, markerModeActive, selectionRootId]);

  useEffect(() => {
    if (!markerModeActive || !authenticated || saving) return;
    let timer: number | undefined;
    const captureInlineSelection = (event: MouseEvent | TouchEvent) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const root = document.getElementById(selectionRootId);
        if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
        const selection = selectionFromLegalText(root, legislationText);
        if (!selection) return;
        void createOrReplaceHighlight(selection, true);
      }, 80);
    };
    document.addEventListener("mouseup", captureInlineSelection);
    document.addEventListener("touchend", captureInlineSelection, { passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseup", captureInlineSelection);
      document.removeEventListener("touchend", captureInlineSelection);
    };
    // A caneta usa a cor e a lista atuais; reinstalar o listener após salvar
    // mantém vários grifos seguidos sem pedir uma nova abertura de menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, color, highlights, legislationText, markerModeActive, saving, selectionRootId]);

  async function changeColor(nextColor: HighlightColor) {
    if (!selectedHighlight || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/legisbot/destaques/${selectedHighlight.id}`, {
        method: "PATCH",
        headers: await authHeaders(true),
        body: JSON.stringify({ color: nextColor }),
      });
      const result = await response.json() as HighlightsResponse;
      if (!response.ok || !result.success) {
        setMessage(result.message ?? "Não foi possível trocar a cor.");
        return;
      }
      replaceHighlights(highlights.map((item) => item.id === selectedHighlight.id ? { ...item, color: nextColor } : item));
      onSelectedHighlightClear();
      setMessage("Cor do destaque atualizada.");
    } catch {
      setMessage("Não foi possível trocar a cor.");
    } finally {
      setSaving(false);
    }
  }

  async function removeHighlight() {
    if (!selectedHighlight || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/legisbot/destaques/${selectedHighlight.id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json() as HighlightsResponse;
      if (!response.ok || !result.success) {
        setMessage(result.message ?? "Não foi possível remover o destaque.");
        return;
      }
      replaceHighlights(highlights.filter((item) => item.id !== selectedHighlight.id));
      if (lastCreatedHighlight?.id === selectedHighlight.id) setLastCreatedHighlight(null);
      onSelectedHighlightClear();
      setMessage("Destaque removido.");
    } catch {
      setMessage("Não foi possível remover o destaque.");
    } finally {
      setSaving(false);
    }
  }

  async function undoLastHighlight() {
    if (!lastCreatedHighlight || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/legisbot/destaques/${lastCreatedHighlight.id}`, {
        method: "DELETE",
        headers: await authHeaders(),
      });
      const result = await response.json() as HighlightsResponse;
      if (!response.ok || !result.success) {
        setMessage(result.message ?? "Não foi possível desfazer o destaque.");
        return;
      }
      replaceHighlights(highlights.filter((item) => item.id !== lastCreatedHighlight.id));
      setLastCreatedHighlight(null);
      onSelectedHighlightClear();
      setMessage("Último destaque desfeito.");
    } catch {
      setMessage("Não foi possível desfazer o destaque.");
    } finally {
      setSaving(false);
    }
  }

  async function undoAllHighlights() {
    if (!highlights.length || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const headers = await authHeaders();
      const results = await Promise.all(highlights.map(async (item) => {
        const response = await fetch(`/api/legisbot/destaques/${item.id}`, { method: "DELETE", headers });
        const result = await response.json() as HighlightsResponse;
        return response.ok && result.success;
      }));
      if (results.some((success) => !success)) throw new Error("partial_delete");
      replaceHighlights([]);
      setLastCreatedHighlight(null);
      onSelectedHighlightClear();
      setMessage("Todos os destaques deste artigo foram desfeitos.");
    } catch {
      const { data } = await supabase.auth.getSession();
      await loadWithToken(data.session?.access_token ?? null);
      setMessage("Não foi possível desfazer todos os destaques.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || authenticated === null) {
    return <section className="highlights-tool"><p className="highlights-status">Carregando seus destaques…</p></section>;
  }

  if (!authenticated) {
    return <section className="highlights-tool highlights-login-callout">
      <p>Entre na sua conta para salvar seus destaques.</p>
      <div><Link href={`/conta?modo=login&retorno=${encodeURIComponent(returnPath)}`}>Entrar</Link><Link href={`/conta?modo=cadastro&retorno=${encodeURIComponent(returnPath)}`}>Criar conta</Link></div>
    </section>;
  }

  return <section className="highlights-tool" aria-labelledby="highlights-title">
    <div className="highlights-tool-heading">
      <div><p className="community-eyebrow">Marca-texto pessoal</p><h2 id="highlights-title">Seus destaques</h2></div>
      <span>{highlights.length} {highlights.length === 1 ? "trecho" : "trechos"}</span>
    </div>
    <div className="highlights-marker-toolbar">
      <button type="button" className={markerModeActive ? "active" : ""} aria-pressed={markerModeActive} onClick={() => onMarkerModeChange(!markerModeActive)}>{markerModeActive ? "🖍️ Marca-texto ativo" : "🖍️ Ativar marca-texto"}</button>
      <HighlightPalette value={color} onChange={setColor} disabled={saving} label="Cor da caneta marca-texto" />
      {lastCreatedHighlight ? <button type="button" className="highlights-undo-inline" disabled={saving} onClick={() => void undoLastHighlight()}>↶ Desfazer</button> : null}
    </div>
    <p className="highlights-instructions">{markerModeActive ? "Arraste sobre o texto legal para grifar. No celular, segure uma palavra e arraste; tocar novamente no ícone encerra o modo." : "Ative o marca-texto para grifar diretamente no texto legal."}</p>
    <button type="button" className="highlights-selector-open" onClick={() => { setSelectorSelection(null); setSelectorOpen(true); }}>Selecionar trecho manualmente</button>
    {selectedHighlight ? <div className="highlights-edit" role="dialog" aria-label="Editar destaque selecionado">
      <p><strong>Destaque selecionado:</strong> “{selectedHighlight.text}”</p>
      <HighlightPalette value={selectedHighlight.color} onChange={(nextColor) => void changeColor(nextColor)} disabled={saving} label="Nova cor do destaque" />
      <div className="highlights-edit-actions"><button type="button" disabled={saving} className="danger" onClick={() => void removeHighlight()}>Remover destaque</button><button type="button" onClick={onSelectedHighlightClear}>Fechar</button></div>
    </div> : null}
    {message || highlights.length ? <div className="highlights-feedback" role="status">{message ? <span>{message}</span> : null}<div className="highlights-feedback-actions">{lastCreatedHighlight ? <button type="button" disabled={saving} onClick={() => void undoLastHighlight()}>↶ Desfazer último</button> : null}{highlights.length ? <button type="button" disabled={saving} onClick={() => window.confirm("Desfazer todos os destaques deste artigo?") && void undoAllHighlights()}>↶ Desfazer tudo</button> : null}</div></div> : null}
    {selectorOpen ? <div className="community-modal-backdrop" role="presentation"><div className="community-modal highlight-selector" role="dialog" aria-modal="true" aria-labelledby="highlight-selector-title">
      <h3 id="highlight-selector-title">Selecionar trecho da legislação</h3>
      <p>Selecione somente o trecho que deseja destacar.</p>
      <textarea ref={selectionArea} className="highlight-selector-text" aria-label="Texto da legislação para destacar" readOnly value={legislationText} rows={12} onSelect={captureSelectorSelection} onMouseUp={captureSelectorSelection} onTouchEnd={() => window.setTimeout(captureSelectorSelection, 180)} />
      {selectorSelection ? <p className="highlight-selector-selection"><strong>Trecho selecionado:</strong> “{selectorSelection.text}”</p> : <p className="highlight-selector-hint">Selecione o texto com o mouse ou toque e segure no celular.</p>}
      <HighlightPalette value={color} onChange={setColor} disabled={saving} label="Cor do destaque" />
      <div className="community-modal-actions"><button type="button" onClick={closeSelector}>Cancelar</button><button type="button" disabled={!selectorSelection || saving} onClick={() => { if (selectorSelection) void createOrReplaceHighlight(selectorSelection); }}>{saving ? "Carregando…" : "Salvar destaque"}</button></div>
    </div></div> : null}
  </section>;
}
