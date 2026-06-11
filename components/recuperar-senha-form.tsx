"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function RecuperarSenhaForm() {
  const [email, setEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [modoNovaSenha, setModoNovaSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setModoNovaSenha(true);
        setErro("");
        setSucesso("");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setSucesso("");
    setEnviando(true);

    if (modoNovaSenha) {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
      });

      if (error) {
        setErro("Nao foi possivel atualizar sua senha. Tente novamente.");
        setEnviando(false);
        return;
      }

      setSucesso("Senha atualizada. Voce ja pode entrar com a nova senha.");
      setNovaSenha("");
      setEnviando(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/recuperar-senha`,
    });

    if (error) {
      setErro("Nao foi possivel enviar a recuperacao. Tente novamente.");
      setEnviando(false);
      return;
    }

    setSucesso("Enviamos as instrucoes de recuperacao para seu e-mail.");
    setEnviando(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {modoNovaSenha ? (
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">
            Nova senha
          </span>
          <input
            type="password"
            value={novaSenha}
            onChange={(event) => setNovaSenha(event.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      ) : (
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
      )}

      {erro ? <p className="text-sm font-medium text-red-700">{erro}</p> : null}
      {sucesso ? (
        <p className="text-sm font-medium text-green-700">{sucesso}</p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {enviando
          ? "Enviando..."
          : modoNovaSenha
            ? "Salvar nova senha"
            : "Recuperar senha"}
      </button>

      <p className="text-sm text-slate-600">
        Lembrou a senha?{" "}
        <Link href="/login" className="font-semibold text-blue-700">
          Entrar
        </Link>
      </p>
    </form>
  );
}
