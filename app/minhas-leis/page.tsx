import type { Metadata } from "next";
import { StudentLawsClient } from "@/components/student-laws-client";

export const metadata: Metadata = {
  title: "Legis Questões | Legislação para Concursos",
  description: "Acesse as leis liberadas para sua conta e organize seu estudo.",
};

export default function StudentLawsPage() {
  return <StudentLawsClient />;
}
