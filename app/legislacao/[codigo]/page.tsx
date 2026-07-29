import { notFound, redirect } from "next/navigation";
import {
  encontrarLegislacaoPorSlug,
  getLegislacoes,
  getVadeMecumHotmartUrl,
  isVadeMecum,
} from "@/lib/legislacoes";

type LegislacaoRedirectPageProps = {
  params: Promise<{
    codigo: string;
  }>;
};

export default async function LegislacaoRedirectPage({
  params,
}: LegislacaoRedirectPageProps) {
  const { codigo } = await params;
  const legislacao = encontrarLegislacaoPorSlug(await getLegislacoes(), codigo);

  if (legislacao && isVadeMecum(legislacao)) {
    const hotmartUrl = getVadeMecumHotmartUrl(legislacao);

    if (hotmartUrl) {
      redirect(hotmartUrl);
    }

    notFound();
  }

  redirect(`/leisflashcards/${codigo}`);
}
