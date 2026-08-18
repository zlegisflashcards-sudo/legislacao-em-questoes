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
  className?: string;
};

function HighlightPalette({ value, onChange, disabled = false, label, className = "" }: HighlightPaletteProps) {
  return <div className={`highlight-palette ${className}`.trim()} role="radiogroup" aria-label={label}>
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
  selection: HighlightSelection | null;
  selectedHighlight: LegisBotHighlight | null;
  onHighlightsChange: (highlights: LegisBotHighlight[]) => void;
  onSelectionClear: () => void;
  onSelectedHighlightClear: () => void;
};

async function authHeaders(json = false): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  return headers;
}

export default function LegisBotPersonalHighlights({
  slug,
  ordem,
  legislationText,
  selection,
  selectedHighlight,
  onHighlightsChange,
  onSelectionClear,
  onSelectedHighlightClear,
}: Props) {
  const [highlights, setHighlights] = useState<LegisBotHighlight[]>([]);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [color, setColor] = useState<HighlightColor>("amarelo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileSelectorOpen, setMobileSelectorOpen] = useState(false);
  const [mobileSelection, setMobileSelection] = useState<HighlightSelection | null>(null);
  const [lastCreatedHighlight, setLastCreatedHighlight] = useState<LegisBotHighlight | null>(null);
  const mobileSelectionArea = useRef<HTMLTextAreaElement>(null);
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

  function captureMobileSelection() {
    const textarea = mobileSelectionArea.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = legislationText.slice(start, end);
    setMobileSelection(text.trim() ? { start, end, text } : null);
  }

  function closeMobileSelector() {
    setMobileSelectorOpen(false);
    setMobileSelection(null);
  }

  async function createOrReplaceHighlight(targetSelection = selection, closeAfterSave = false) {
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
      onSelectionClear();
      window.getSelection()?.removeAllRanges();
      if (closeAfterSave) closeMobileSelector();
      setMessage("Destaque salvo ✓");
    } catch {
      setMessage("Não foi possível salvar o destaque.");
    } finally {
      setSaving(false);
    }
  }

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
    <p className="highlights-instructions highlights-desktop-instructions">Escolha uma cor, selecione um trecho diretamente no texto legal acima e aplique o destaque.</p>
    <p className="highlights-instructions highlights-mobile-instructions">Abra o seletor para marcar um trecho da legislação.</p>
    <HighlightPalette value={color} onChange={setColor} disabled={saving} label="Cor do novo destaque" className="highlights-primary-palette" />
    <button type="button" className="highlights-mobile-open" onClick={() => { setMobileSelection(null); setMobileSelectorOpen(true); }}>Selecionar trecho da legislação</button>
    {selection ? <div className="highlights-selection">
      <p><strong>Trecho selecionado:</strong> “{selection.text}”</p>
      <div><button type="button" disabled={saving} onClick={() => void createOrReplaceHighlight(selection)}>{saving ? "Salvando…" : "Aplicar destaque"}</button><button type="button" onClick={onSelectionClear}>Cancelar</button></div>
    </div> : <p className="highlights-selection-hint">Selecione o texto com o mouse ou com os controles nativos do celular.</p>}
    {selectedHighlight ? <div className="highlights-edit" role="dialog" aria-label="Editar destaque selecionado">
      <p><strong>Destaque selecionado:</strong> “{selectedHighlight.text}”</p>
      <HighlightPalette value={selectedHighlight.color} onChange={(nextColor) => void changeColor(nextColor)} disabled={saving} label="Nova cor do destaque" />
      <div className="highlights-edit-actions"><button type="button" disabled={saving} className="danger" onClick={() => void removeHighlight()}>Remover destaque</button><button type="button" onClick={onSelectedHighlightClear}>Fechar</button></div>
    </div> : null}
    {message ? <div className="highlights-feedback" role="status"><span>{message}</span>{lastCreatedHighlight ? <button type="button" disabled={saving} onClick={() => void undoLastHighlight()}>↶ Desfazer</button> : null}</div> : null}
    {mobileSelectorOpen ? <div className="community-modal-backdrop" role="presentation"><div className="community-modal highlight-mobile-selector" role="dialog" aria-modal="true" aria-labelledby="highlight-mobile-title">
      <h3 id="highlight-mobile-title">Selecionar trecho da legislação</h3>
      <p>Selecione somente o trecho que deseja destacar.</p>
      <textarea ref={mobileSelectionArea} readOnly value={legislationText} rows={14} onSelect={captureMobileSelection} onTouchEnd={() => window.setTimeout(captureMobileSelection, 80)} />
      {mobileSelection ? <p className="highlight-mobile-selection"><strong>Trecho selecionado:</strong> “{mobileSelection.text}”</p> : <p className="highlight-mobile-hint">Toque e segure sobre o texto para iniciar a seleção.</p>}
      <HighlightPalette value={color} onChange={setColor} disabled={saving} label="Cor do destaque no celular" />
      <div className="community-modal-actions"><button type="button" onClick={closeMobileSelector}>Cancelar</button><button type="button" disabled={!mobileSelection || saving} onClick={() => void createOrReplaceHighlight(mobileSelection, true)}>{saving ? "Salvando…" : "Salvar destaque"}</button></div>
    </div></div> : null}
  </section>;
}
