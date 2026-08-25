"use client";

import type { CSSProperties } from "react";

export function CampaignPerformanceDonut({ correct, errors, accuracy, compact = false }: { correct: number; errors: number; accuracy: number; compact?: boolean }) {
  return <section className={`lf-attempt-performance${compact ? " is-compact" : ""}`} aria-label={`Aproveitamento da tentativa: ${accuracy}%, ${correct} acertos e ${errors} erros`}><div className="lf-attempt-donut" style={{ "--lf-correct": `${accuracy}%` } as CSSProperties}><div><strong>{accuracy}%</strong></div></div><p className="lf-attempt-legend"><span className="is-correct">{correct} acertos</span><span className="is-wrong">{errors} erros</span></p></section>;
}
