"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ActivationState = "loading" | "valid" | "invalid" | "activated" | "activated_now" | "error";

export function StudentAccountActivation() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<ActivationState>("loading");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    async function inspect() {
      if (!token) { setState("invalid"); return; }
      const response = await fetch(`/api/aluno/ativacao?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({ state: "invalid" })) as { state?: ActivationState; email?: string };
      if (result.state === "valid") { setEmail(result.email ?? ""); setState("valid"); return; }
      setState(result.state === "activated" ? "activated" : "invalid");
    }
    void inspect();
  }, [token]);

  async function activate(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password.length < 8 || password !== confirmation) { setMessage("As senhas devem coincidir e ter pelo menos 8 caracteres."); return; }
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/aluno/ativacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const result = await response.json().catch(() => ({ state: "error" })) as { state?: ActivationState; message?: string };
      if (result.state === "activated_now") { setState("activated"); return; }
      if (result.state === "activated") { setState("activated"); return; }
      setMessage(result.message ?? "Este link de ativacao nao e mais valido.");
    } finally { setPending(false); }
  }

  if (state === "loading") return <p className="text-slate-600">Carregando ativacao…</p>;
  if (state === "activated") return <ActivationCard title="Sua conta já está ativada" description="Entre normalmente com seu e-mail e a senha escolhida."><a className="inline-block rounded-xl bg-blue-700 px-5 py-3 font-black text-white" href="/conta">Entrar na minha conta</a></ActivationCard>;
  if (state !== "valid") return <ActivationCard title="Link de ativação inválido" description="Este link de ativação não é mais válido. Entre em contato com nossa equipe para solicitar um novo acesso."><a className="font-bold text-blue-700 hover:underline" href="/conta">Ir para minha conta</a></ActivationCard>;
  return <ActivationCard title="Ative sua conta" description="Defina uma senha para acessar os conteúdos que já estão liberados para você."><form action={activate} className="space-y-4"><label className="block text-sm font-bold text-slate-700">E-mail de acesso<input value={email} readOnly className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 font-normal" /></label><label className="block text-sm font-bold text-slate-700">Criar senha<input name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label><label className="block text-sm font-bold text-slate-700">Confirmar senha<input name="confirmation" type="password" minLength={8} required autoComplete="new-password" className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-4 font-normal" /></label><button disabled={pending} className="rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-60">{pending ? "Ativando…" : "Ativar minha conta"}</button>{message ? <p role="status" className="text-sm font-bold text-blue-700">{message}</p> : null}</form></ActivationCard>;
}

function ActivationCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="space-y-6"><div><h1 className="text-3xl font-black text-[#062a5f]">{title}</h1><p className="mt-2 text-slate-600">{description}</p></div><div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">{children}</div></div>;
}
