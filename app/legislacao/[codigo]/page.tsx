import { redirect } from "next/navigation";

type LegislacaoRedirectPageProps = {
  params: Promise<{
    codigo: string;
  }>;
};

export default async function LegislacaoRedirectPage({
  params,
}: LegislacaoRedirectPageProps) {
  const { codigo } = await params;

  redirect(`/leisflashcards/${codigo}`);
}
