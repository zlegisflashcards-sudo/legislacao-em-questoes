"use client";

import { useEffect, useRef } from "react";
import LegisBotPageClient from "@/app/legisbot/legisbot-page-client";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";

export type LegisBotOverlayArticle = {
  ordem?: string | null;
  titulo?: string | null;
  assunto?: string | null;
  legislacao?: string | null;
};

export function LegisBotOverlay({ slug, question, initialTab, onClose }: { slug: string; question: LegisBotOverlayArticle; initialTab: LegisBotStudyTab; onClose: () => void }) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>(".legisbot-overlay-back")?.focus(), 0);
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
  }, [onClose]);

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

  return <div className="lf-legisbot-overlay" role="presentation"><aside ref={panelRef} className="lf-legisbot-panel" role="dialog" aria-modal="true" aria-label="LegisBot" onKeyDown={trapFocus}><LegisBotPageClient slug={slug} ordem={question.ordem ?? ""} dadosIniciais={{ titulo: question.titulo ?? "", assunto: question.assunto ?? "", legislacao: question.legislacao ?? "" }} initialCommunityCount={0} initialTab={initialTab} embedded onClose={onClose} /></aside></div>;
}
