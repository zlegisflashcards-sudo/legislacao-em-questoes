"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buscarOuCriarAluno } from "@/lib/alunos";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setSucesso("");
    setEnviando(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error || !data.user) {
      setErro("Nao foi possivel entrar. Confira seu e-mail e senha.");
      setEnviando(false);
      return;
    }

    try {
      await buscarOuCriarAluno(data.user);
      setSucesso("Login realizado. Redirecionando...");
      router.push("/aluno");
      router.refresh();
    } catch {
      setErro("Login realizado, mas nao foi possivel carregar seu perfil.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-800">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-800">Senha</span>
        <input
          type="password"
          value={senha}
          onChange={(event) => setSenha(event.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      {erro ? <p className="text-sm font-medium text-red-700">{erro}</p> : null}
      {sucesso ? (
        <p className="text-sm font-medium text-green-700">{sucesso}</p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando ? "Entrando..." : "Entrar"}
      </button>

      <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/cadastro" className="font-semibold text-blue-700">
          Criar conta
        </Link>
        <Link href="/recuperar-senha" className="font-semibold text-blue-700">
          Recuperar senha
        </Link>
      </div>
    </form>
  );
}
