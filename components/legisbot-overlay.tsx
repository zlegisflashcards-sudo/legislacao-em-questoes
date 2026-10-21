"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";
import type { LegisBotHighlight } from "@/lib/legisbot-highlights";
import { PreparationNotice } from "@/app/legisbot/[slug]/preparation-notice";

export type LegisBotOverlayArticle = {
  ordem?: string | null;
  titulo?: string | null;
  assunto?: string | null;
  legislacao?: string | null;
  comentario?: string | null;
  /** Metadado editorial exibido somente no contexto do LegisCast. */
  incidencia?: "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";
  artigo_recente?: boolean;
};

export function LegisBotOverlay({ slug, question, articles, initialTab, publicComment, recorteId, onHighlightsChange, onClose }: { slug: string; question: LegisBotOverlayArticle; /** Artigos disponíveis no contexto atual, em ordem de estudo. */ articles?: LegisBotOverlayArticle[]; initialTab: LegisBotStudyTab; publicComment?: string | null; recorteId?: string | null; onHighlightsChange?: (ordem: string, highlights: LegisBotHighlight[]) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [activeArticle, setActiveArticle] = useState(question);
  const [availability, setAvailability] = useState<{ status: "loading" | "ready" | "preparing" | "technical_error"; lawName: string }>({ status: "loading", lawName: "" });
  const availableArticles = useMemo(() => {
    const seen = new Set<string>();
    const result: LegisBotOverlayArticle[] = [];
    for (const article of [...(articles ?? []), question]) {
      const key = article.ordem?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(article);
    }
    return result;
  }, [articles, question]);
  const activeIndex = availableArticles.findIndex((article) => article.ordem?.trim() === activeArticle.ordem?.trim());
  const previousArticle = activeIndex > 0 ? availableArticles[activeIndex - 1] : null;
  const nextArticle = activeIndex >= 0 && activeIndex < availableArticles.length - 1 ? availableArticles[activeIndex + 1] : null;

  useEffect(() => {
    setActiveArticle(question);
  }, [question]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/legisbot/${encodeURIComponent(slug)}/availability`)
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(({ response, body }) => {
        if (!active) return;
        setAvailability({ status: response.ok && body.status === "preparing" ? "preparing" : response.ok && body.status === "ready" ? "ready" : "technical_error", lawName: typeof body.lawName === "string" ? body.lawName : "" });
      })
      .catch(() => { if (active) setAvailability((current) => ({ ...current, status: "technical_error" })); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>(".legisbot-overlay-close, .legisbot-overlay-back")?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [availability.status, onClose]);

  function trapFocus(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((item) => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const handleHighlightsChange = useCallback((items: LegisBotHighlight[]) => {
    onHighlightsChange?.(activeArticle.ordem ?? "", items);
  }, [activeArticle.ordem, onHighlightsChange]);

  return <div className="lf-legisbot-overlay" role="presentation"><aside ref={panelRef} className="lf-legisbot-panel" role="dialog" aria-modal="true" aria-label="LegisBot" onKeyDown={trapFocus}>{availability.status === "preparing" ? <PreparationNotice lawName={availability.lawName || "Lei Interativa"} embedded onClose={onClose} /> : <LegisBotPageClient slug={slug} ordem={activeArticle.ordem ?? ""} dadosIniciais={{ titulo: activeArticle.titulo ?? "", assunto: activeArticle.assunto ?? "", legislacao: activeArticle.legislacao ?? "" }} initialCommunityCount={0} initialTab={initialTab} embedded publicComment={activeArticle.comentario ?? (activeArticle === question ? publicComment : null)} mappingIncidence={activeArticle.incidencia} articleRecent={activeArticle.artigo_recente === true} showArticleQuestions={Boolean(activeArticle.ordem)} questionsRecorteId={recorteId} onPersonalHighlightsChange={handleHighlightsChange} onPreviousArticle={previousArticle ? () => setActiveArticle(previousArticle) : undefined} onNextArticle={nextArticle ? () => setActiveArticle(nextArticle) : undefined} onClose={onClose} />}</aside></div>;
}
