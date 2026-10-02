"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { QuestionStandardizationPanel, type StandardizableQuestion } from "@/components/admin/question-standardization-panel";

export function ArticleContextStandardizationTrigger({ lawSlug, slug, ordem, questions, legisbotCount, communityCount, label = "Padronizar contexto inteiro", primary = true }: { lawSlug: string; slug: string; ordem: string; questions: StandardizableQuestion[]; legisbotCount: number; communityCount: number; label?: string; primary?: boolean }) {
  const router = useRouter(); const [open, setOpen] = useState(false);
  return <>{questions.length ? <button type="button" className={`admin-button ${primary ? "primary" : "secondary"}`} onClick={() => setOpen(true)}>{label}</button> : null}{open ? <QuestionStandardizationPanel lawSlug={lawSlug} slug={slug} ordem={ordem} questions={questions} selectedIds={questions.map((question) => question.id)} contextMode linkedCounts={{ legisbot: legisbotCount, community: communityCount, highlights: 0 }} onClose={() => setOpen(false)} onSuccess={() => { setOpen(false); router.refresh(); }} hrefForOrder={(nextOrder) => `/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(nextOrder)}?aba=artigo&lei=${encodeURIComponent(slug)}`} /> : null}</>;
}
