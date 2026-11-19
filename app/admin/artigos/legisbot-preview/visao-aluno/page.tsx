import Link from "next/link";
import { notFound } from "next/navigation";
import ContinuousReadingClient from "@/app/legisbot/[slug]/continuous-reading-client";
import styles from "@/app/legisbot/[slug]/continuous-reading.module.css";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getContinuousReadingBlockTextsForLaw, getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import { getLegiscastAudioForLaw } from "@/lib/legiscast-audios-server";

export const dynamic = "force-dynamic";

export default async function AdministrativeStudentStructureView({ searchParams }: { searchParams: Promise<{ lei?: string; estrutura?: string }> }) {
  await exigirAdministrador();
  const query = await searchParams;
  const slug = query.lei?.trim().toLowerCase() ?? "";
  const structureId = /^\d+$/.test(query.estrutura ?? "") ? Number(query.estrutura) : NaN;
  const model = await getContinuousReadingModel(slug);
  if (!model || !Number.isSafeInteger(structureId)) notFound();

  const selectedStructure = model.structures.find((structure) => structure.id === structureId);
  if (!selectedStructure) notFound();
  const initialStudyUnit = model.studyUnits.find((unit) => unit.structureIds.includes(structureId)) ?? null;
  const scopedStructureIds = new Set(initialStudyUnit?.structureIds ?? [structureId]);
  const initialReferences = model.references.filter((reference) => {
    const referenceStructureId = reference.hierarchy.at(-1)?.id;
    return referenceStructureId !== undefined && scopedStructureIds.has(referenceStructureId);
  });
  const preparedIds = initialReferences.filter((reference) => reference.prepared).slice(0, 30).map((reference) => reference.id);
  const [texts, initialAudioResult] = await Promise.all([
    getContinuousReadingBlockTextsForLaw(slug, preparedIds),
    getLegiscastAudioForLaw(model.law.id, String(structureId)).catch(() => ({ audio: null, status: "unavailable" as const })),
  ]);
  const legislationById = new Map((texts ?? []).map((block) => [block.id, block.legislation]));
  const initialBlocks = initialReferences.flatMap((reference) => {
    const legislation = legislationById.get(reference.id);
    return legislation ? [{ ...reference, legislation }] : [];
  });

  return <main className={`${styles.page} admin-shell`}>
    <section className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Simulação administrativa</p>
        <h1>Visão do aluno — {selectedStructure.name}</h1>
        <p>Esta leitura usa somente os blocos do recorte selecionado. Ela não habilita a Lei Interativa pública nem altera a liberação parcial.</p>
        <Link className="admin-button secondary" href={`/admin/artigos/legisbot-preview?lei=${encodeURIComponent(slug)}&estrutura=${encodeURIComponent(String(structureId))}`}>← Voltar à conferência</Link>
      </header>
      {initialBlocks.length ? <ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={model.law.nome_curto || model.law.titulo} lawTitle={model.law.titulo} references={model.references} structures={model.structures} studyUnits={model.studyUnits} initialStructureId={structureId} initialStudyUnitId={initialStudyUnit?.id ?? null} initialBlocks={initialBlocks} initialTab="legisbot" scopedReading audioEndpoint={`/api/admin/legisbot/${encodeURIComponent(slug)}/legiscast`} initialAudio={initialAudioResult.audio} initialAudioStatus={initialAudioResult.status} /> : <section className={styles.empty}><h2>Nenhum bloco preparado neste recorte</h2><p>Associe ou prepare os blocos da estrutura antes de validar a leitura.</p></section>}
    </section>
  </main>;
}
