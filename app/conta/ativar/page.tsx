import { Suspense } from "react";
import { StudentAccountActivation } from "@/components/student-account-activation";

export default function AccountActivationPage() {
  return <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-6">
    <Suspense fallback={<p className="text-slate-600">Carregando ativacao…</p>}><StudentAccountActivation /></Suspense>
  </div>;
}
