"use client";

import { useState } from "react";
import Link from "next/link";

type CheckItem = "estrutura" | "materiais" | "legiscast" | "anki";
type Card = { id: "estrutura" | "materiais" | "legiscast" | "anki" | "questoes" | "recortes"; label: string; value: number | string; description: string; action: string; href: string; tool?: boolean };
const checkable = new Set<CheckItem>(["estrutura", "materiais", "legiscast", "anki"]);

async function updateCheck(lawId: number, item: CheckItem, completed: boolean) {
  const response = await fetch("/api/admin/law-overview-checks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lawId, item, completed }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível salvar a marcação.");
}

export function LawOverviewCards({ lawId, cards, initialCompleted }: { lawId: number; cards: Card[]; initialCompleted: CheckItem[] }) {
  const [completed, setCompleted] = useState<CheckItem[]>(initialCompleted);
  const [saving, setSaving] = useState<CheckItem | null>(null);
  const [error, setError] = useState("");
  async function toggle(item: CheckItem) {
    if (saving) return;
    const next = !completed.includes(item); const previous = completed;
    setCompleted(next ? [...completed, item] : completed.filter((value) => value !== item)); setSaving(item); setError("");
    try { await updateCheck(lawId, item, next); } catch (caught) { setCompleted(previous); setError(caught instanceof Error ? caught.message : "Não foi possível salvar a marcação."); } finally { setSaving(null); }
  }
  return <>
    {error ? <p className="admin-alert error" role="alert">{error}</p> : null}
    <section className="law-center-overview-grid" aria-label="Resumo operacional">
      {cards.map((card) => {
        const item = checkable.has(card.id as CheckItem) ? card.id as CheckItem : null; const done = item ? completed.includes(item) : false;
        return <article className={`law-center-operation-card${card.tool ? " law-center-operation-card-tool" : ""}${done ? " is-complete" : ""}`} key={card.id}>
          {item ? <button type="button" className="law-center-card-check" aria-pressed={done} aria-label={`${done ? "Desmarcar" : "Marcar"} ${card.label} como concluído`} disabled={saving === item} onClick={() => void toggle(item)}>{done ? "✓" : ""}</button> : null}
          <Link href={card.href} className="law-center-card-link"><span className="law-center-card-label">{card.label}</span><strong aria-hidden={card.tool}>{card.value}</strong><span>{card.description}</span><b>{card.action} <span aria-hidden="true">→</span></b></Link>
        </article>;
      })}
    </section>
  </>;
}
