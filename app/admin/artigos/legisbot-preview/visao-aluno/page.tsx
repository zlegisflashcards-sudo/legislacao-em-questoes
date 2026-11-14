import Link from "next/link";
import { notFound } from "next/navigation";
import ContinuousReadingClient from "@/app/legisbot/[slug]/continuous-reading-client";
import styles from "@/app/legisbot/[slug]/continuous-reading.module.css";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getContinuousReadingBlockTextsForLaw, getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";

export const dynamic = "force-dynamic";

function descendantsOf(structureId: number, structures: Array<{ id: number; parentId: number | null }>) {
  const descendants = new Set([structureId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const structure of structures) {
      if (structure.parentId !== null && descendants.has(structure.parentId) && !descendants.has(structure.id)) {
        descendants.add(structure.id);
        changed = true;
      }
    }
  }
  return descendants;
}

export default async function AdministrativeStudentStructureView({ searchParams }: { searchParams: Promise<{ lei?: string; estrutura?: string }> }) {
  await exigirAdministrador();
  const query = await searchParams;
  const slug = query.lei?.trim().toLowerCase() ?? "";
  const structureId = /^\d+$/.test(query.estrutura ?? "") ? Number(query.estrutura) : NaN;
  const model = await getContinuousReadingModel(slug);
  if (!model || !Number.isSafeInteger(structureId)) notFound();

  const selectedStructure = model.structures.find((structure) => structure.id === structureId);
  if (!selectedStructure) notFound();
  const scopeIds = descendantsOf(structureId, model.structures);
  const references = model.references.filter((reference) => reference.hierarchy.some((node) => scopeIds.has(node.id)));
  const preparedIds = references.filter((reference) => reference.prepared).map((reference) => reference.id);
  const texts = await getContinuousReadingBlockTextsForLaw(slug, preparedIds);
  const legislationById = new Map((texts ?? []).map((block) => [block.id, block.legislation]));
  const initialBlocks = references.flatMap((reference) => {
    const legislation = legislationById.get(reference.id);
    return legislation ? [{ ...reference, legislation }] : [];
  });
  const scopeStructures = model.structures.filter((structure) => scopeIds.has(structure.id));

  return <main className={`${styles.page} admin-shell`}>
    <section className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Simulação administrativa</p>
        <h1>Visão do aluno — {selectedStructure.name}</h1>
        <p>Esta leitura usa somente os blocos do recorte selecionado. Ela não habilita a Lei Interativa pública nem altera a liberação parcial.</p>
        <Link className="admin-button secondary" href={`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&estrutura=${encodeURIComponent(String(structureId))}`}>← Voltar à conferência</Link>
      </header>
      {initialBlocks.length ? <ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={selectedStructure.name} lawTitle={model.law.titulo} references={references} structures={scopeStructures} initialBlocks={initialBlocks} initialTab="legisbot" adminPreview /> : <section className={styles.empty}><h2>Nenhum bloco preparado neste recorte</h2><p>Associe ou prepare os blocos da estrutura antes de validar a leitura.</p></section>}
    </section>
  </main>;
}
