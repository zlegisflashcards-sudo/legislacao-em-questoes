import type { Metadata } from "next";
import { DashboardClient } from "@/components/dashboard-client";

export const metadata: Metadata = {
  title: "Meu painel | Legislação para Concursos",
  description: "Organize seu edital e registre manualmente sua revisão diária.",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
