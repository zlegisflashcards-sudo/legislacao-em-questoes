import { AlunoDashboard } from "@/components/aluno-dashboard";

export default function AlunoPage() {
  return (
    <div className="bg-[#eef2f7]">
      <div className="mx-auto min-h-[calc(100vh-220px)] max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        <AlunoDashboard />
      </div>
    </div>
  );
}
