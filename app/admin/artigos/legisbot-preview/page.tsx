import Link from "next/link";
import type { ReactNode } from "react";
import ContinuousReadingClient from "@/app/legisbot/[slug]/continuous-reading-client";
import styles from "@/app/legisbot/[slug]/continuous-reading.module.css";
import { exigirAdministrador } from "@/lib/admin-auth";
import { getContinuousReadingBlocks, getContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";

export const dynamic = "force-dynamic";

function PreviewShell({ slug, children }: { slug: string; children: ReactNode }) {
  return <><Link className="admin-central-link" href={`/admin/artigos?aba=artigos&lei=${encodeURIComponent(slug)}`}>← Voltar para a Base Legislativa</Link><p className="admin-eyebrow">Prévia administrativa — mesma leitura que será exibida aos alunos</p>{children}</>;
}

export default async function LegisBotPreviewPage({ searchParams }: { searchParams: Promise<{ lei?: string }> }) {
  await exigirAdministrador();
  const slug = (await searchParams).lei?.trim().toLowerCase() ?? "";
  if (!slug) return <main className="admin-shell article-center-shell"><p className="admin-empty">Escolha uma lei para visualizar a prévia.</p></main>;

  try {
    const model = await getContinuousReadingModel(slug);
    if (!model) return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty}`}><h1>Legislação não encontrada</h1><p>Confira a lei selecionada ou volte à Base Legislativa.</p></section></PreviewShell></main>;
    if (!model.integrity.readingAvailable) {
      return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty} ${styles.comingSoon}`}><h1>{model.law.nome_curto || model.law.titulo}</h1><h2>Prévia ainda indisponível</h2><p>A leitura pública desta lei permanece em preparação porque ainda há vínculos pendentes na base. Revise a integridade da leitura contínua antes de liberá-la.</p><div className={styles.preparationBadge}><span aria-hidden="true">●</span> Vínculos pendentes</div></section></PreviewShell></main>;
    }
    const initialBlocks = await getContinuousReadingBlocks(model, 0, 30);
    return <main className="admin-shell"><PreviewShell slug={slug}><ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={model.law.nome_curto || model.law.titulo} references={model.references} initialBlocks={initialBlocks} initialTab="legisbot" adminPreview /></PreviewShell></main>;
  } catch (error) {
    console.error("[Admin] Falha ao montar prévia da leitura contínua.", { slug, tipo: error instanceof Error ? error.name : "unknown" });
    return <main className={`${styles.page} admin-shell`}><PreviewShell slug={slug}><section className={`${styles.shell} ${styles.empty}`}><h1>Prévia temporariamente indisponível</h1><p>A leitura contínua não pôde ser verificada agora.</p></section></PreviewShell></main>;
  }
}
