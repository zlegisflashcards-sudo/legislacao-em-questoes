"use client";

import { useState } from "react";
import type { PublicLawContentTreeNode } from "@/lib/public-law-content-tree";

function PublicLawContentTreeRow({ node, depth = 0 }: { node: PublicLawContentTreeNode; depth?: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return <li className="border-b border-blue-300/15 last:border-b-0">
    <div className="flex min-h-14 min-w-0 items-center gap-2 px-3 py-2 sm:px-4" style={{ paddingLeft: `${12 + depth * 24}px` }}>
      {hasChildren ? <button type="button" onClick={() => setOpen((value) => !value)} aria-label={open ? "Recolher nível" : "Expandir nível"} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg font-black text-blue-200 transition hover:bg-blue-400/10">{open ? "−" : "+"}</button> : <span className="w-8 shrink-0" aria-hidden="true" />}
      <span className={`min-w-0 flex-1 break-words leading-5 ${node.tipo === "titulo" ? "font-black uppercase tracking-wide text-white" : "font-bold text-slate-100"}`}>{node.nome}</span>
      {node.hasLegiscast ? <span className="shrink-0 text-base" role="img" aria-label="LegisCast disponível">🎧</span> : null}
      {node.questionCount > 0 ? <span className="w-8 shrink-0 text-right text-sm font-black text-blue-300">{node.questionCount.toLocaleString("pt-BR")}</span> : null}
    </div>
    {hasChildren && open ? <ul>{node.children.map((child) => <PublicLawContentTreeRow key={child.id} node={child} depth={depth + 1} />)}</ul> : null}
  </li>;
}

export function PublicLawContentTree({ tree }: { tree: PublicLawContentTreeNode[] }) {
  if (!tree.length) return <p className="text-sm text-slate-600">A estrutura desta lei ainda não foi disponibilizada.</p>;
  return <section className="min-w-0 rounded-2xl border border-blue-300/35 bg-transparent p-4 shadow-[0_18px_45px_rgba(0,0,0,0.2)] sm:p-6" aria-labelledby="public-law-content-tree-title">
    <div className="mb-4"><h2 id="public-law-content-tree-title" className="text-2xl font-black text-white">Conteúdo produzido</h2><p className="mt-1 text-sm text-slate-300">Acompanhe a produção disponível em cada parte da lei.</p></div>
    <ul className="overflow-hidden rounded-xl border border-blue-300/25 bg-slate-950/35">{tree.map((node) => <PublicLawContentTreeRow key={node.id} node={node} />)}</ul>
  </section>;
}
