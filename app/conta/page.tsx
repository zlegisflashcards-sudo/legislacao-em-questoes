import { Suspense } from "react";
import { StudentAccount } from "@/components/student-account";

export default function ContaPage() {
  return <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-6">
    <Suspense fallback={<p className="text-slate-600">Carregando sua conta…</p>}>
      <StudentAccount />
    </Suspense>
  </div>;
}
