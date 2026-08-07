import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard-client";

export const metadata: Metadata = {
  title: "Meu painel | Legislação para Concursos",
  description: "Acesse suas leis adquiridas e acompanhe as novidades da sua área de estudos.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
