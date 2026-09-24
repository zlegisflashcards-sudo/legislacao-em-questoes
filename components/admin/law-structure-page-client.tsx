"use client";

import { useState } from "react";
import { LawStructureAdmin, type AdminLawStructureNode } from "@/components/admin/law-structure-admin";

export function LawStructurePageClient({ lawSlug, lawName, initialNodes }: { lawSlug: string; lawName: string; initialNodes: AdminLawStructureNode[] }) {
  const [nodes, setNodes] = useState(initialNodes);
  async function reload() {
    const response = await fetch(`/api/admin/questoes?law_slug=${encodeURIComponent(lawSlug)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.structure)) throw new Error(body.error || "Não foi possível recarregar a estrutura.");
    setNodes(body.structure);
  }
  return <LawStructureAdmin lawSlug={lawSlug} lawName={lawName} nodes={nodes} onReload={reload} />;
}
