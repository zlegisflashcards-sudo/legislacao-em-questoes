import type { Metadata } from "next";
import { StudentLawsClient } from "@/components/student-laws-client";

export const metadata: Metadata = {
  title: "Minhas leis adquiridas | Legislação para Concursos",
  description: "Consulte as leis liberadas para sua conta e organize seu estudo.",
};

export default function StudentLawsPage() {
  return <StudentLawsClient />;
}
