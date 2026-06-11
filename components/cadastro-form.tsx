"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buscarOuCriarAluno } from "@/lib/alunos";
import { supabase } from "@/lib/supabase";

export function CadastroForm() {
  const router = useRouter();
  const [nome, setNome] = useState("");
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

    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: {
          nome,
        },
      },
    });

    if (error) {
      setErro("Nao foi possivel criar sua conta. Tente novamente.");
      setEnviando(false);
      return;
    }

    if (data.user && data.session) {
      try {
        await buscarOuCriarAluno(data.user);
        router.push("/aluno");
        router.refresh();
        return;
      } catch {
        setErro("Conta criada, mas nao foi possivel carregar seu perfil.");
        setEnviando(false);
        return;
      }
    }

    setSucesso(
      "Cadastro iniciado. Confira seu e-mail para confirmar a conta antes de entrar."
    );
    setEnviando(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-800">Nome</span>
        <input
          type="text"
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          required
          autoComplete="name"
          className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
        />
      </label>

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
          minLength={6}
          autoComplete="new-password"
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
        {enviando ? "Criando..." : "Criar conta"}
      </button>

      <p className="text-sm text-slate-600">
        Ja tem conta?{" "}
        <Link href="/login" className="font-semibold text-blue-700">
          Entrar
        </Link>
      </p>
    </form>
  );
}
