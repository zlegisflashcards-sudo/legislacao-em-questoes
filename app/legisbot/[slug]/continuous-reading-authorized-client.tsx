"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LegisBotStudyTab } from "@/components/legisbot-study-tabs";
import { LawStudyBottomNav } from "@/components/law-study-bottom-nav";
import type { ContinuousReadingBlock, ContinuousReadingModel } from "@/lib/legisbot/continuous-reading-server";
import { supabase } from "@/lib/supabase";
import ContinuousReadingClient from "./continuous-reading-client";
import styles from "./continuous-reading.module.css";
import { PreparationNotice } from "./preparation-notice";

type Payload = {
  model?: ContinuousReadingModel;
  initialStructureId?: number | null;
  initialStudyUnitId?: string | null;
  initialBlocks?: ContinuousReadingBlock[];
  redirectTo?: string;
  preparation?: "structure_pending";
  lawName?: string;
  message?: string;
};

export function ContinuousReadingAuthorizedClient({ slug, initialTab, recorteId, questionId, ordem }: { slug: string; initialTab: Exclude<LegisBotStudyTab, "questions">; recorteId: string | null; questionId: string; ordem: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const target = `${window.location.pathname}${window.location.search}`;
      if (!token) {
        window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(target)}`);
        return;
      }
      const query = new URLSearchParams();
      if (questionId) query.set("question_id", questionId);
      if (ordem) query.set("ordem", ordem);
      const response = await fetch(`/api/legisbot/${encodeURIComponent(slug)}/reading${query.size ? `?${query}` : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json().catch(() => ({})) as Payload;
      if (!response.ok) {
        if (response.status === 401) window.location.replace(`/conta?modo=login&retorno=${encodeURIComponent(target)}`);
        else if (active) setMessage(body.message || "Esta lei não está liberada para sua conta.");
        return;
      }
      if (body.redirectTo) {
        const [path, anchor] = body.redirectTo.split("#", 2);
        const suffix = recorteId === null ? "" : `${path.includes("?") ? "&" : "?"}recorte_id=${encodeURIComponent(recorteId)}`;
        router.replace(`${path}${suffix}${anchor === undefined ? "" : `#${anchor}`}`);
        return;
      }
      if (active) setPayload(body);
    })().catch(() => { if (active) setMessage("Não foi possível abrir esta lei agora."); });
    return () => { active = false; };
  }, [ordem, questionId, recorteId, router, slug]);

  const studyNav = <LawStudyBottomNav slug={slug} recorteId={recorteId} activeMode="lei_interativa" />;
  if (message) return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><h1>Acesso indisponível</h1><p>{message}</p></section></main>;
  if (payload?.preparation === "structure_pending") return <div className="pb-24 lg:pb-0"><main className={styles.page}><PreparationNotice lawName={payload.lawName || slug} title="Lei Interativa em preparação" description="Estamos organizando os artigos por capítulo e seção." /></main>{studyNav}</div>;
  if (!payload?.model) return <main className={styles.page}><section className={`${styles.shell} ${styles.empty}`}><p>Verificando seu acesso à lei…</p></section></main>;
  const { model } = payload;
  const resolvedStudyNav = <LawStudyBottomNav slug={model.law.slug} recorteId={recorteId} activeMode="lei_interativa" />;
  if (!model.integrity.readingAvailable) return <div className="pb-24 lg:pb-0"><main className={styles.page}><PreparationNotice lawName={model.law.nome_curto || model.law.titulo} /></main>{resolvedStudyNav}</div>;
  return <div className="pb-24 lg:pb-0"><ContinuousReadingClient slug={model.law.slug.toUpperCase()} title={model.law.nome_curto || model.law.titulo} lawTitle={model.law.titulo} references={model.references} structures={model.structures} studyUnits={model.studyUnits} partialMode={model.publicAccess.mode === "partial"} initialStructureId={payload.initialStructureId ?? null} initialStudyUnitId={payload.initialStudyUnitId ?? null} initialBlocks={payload.initialBlocks ?? []} initialTab={initialTab} recorteId={recorteId} />{resolvedStudyNav}</div>;
}
