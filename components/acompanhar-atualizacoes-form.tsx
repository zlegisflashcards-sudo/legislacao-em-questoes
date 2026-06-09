"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type AcompanharAtualizacoesFormProps = {
  legislacaoCodigo: string;
  legislacaoNome: string;
};

export function AcompanharAtualizacoesForm({
  legislacaoCodigo,
  legislacaoNome,
}: AcompanharAtualizacoesFormProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "duplicate" | "error"
  >("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");

    const { error } = await supabase.from("atualizacoes_email").insert({
      legislacao_codigo: legislacaoCodigo,
      legislacao_nome: legislacaoNome,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
    });

    if (error) {
      if (error.code === "23505") {
        setStatus("duplicate");
        return;
      }

      setStatus("error");
      return;
    }

    setNome("");
    setEmail("");
    setStatus("success");
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-950">
          Acompanhar atualizações
        </h2>
        <p className="text-sm leading-6 text-slate-600">
          Receba avisos quando esta legislação tiver atualização cadastrada.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <label htmlFor="nome-atualizacoes" className="sr-only">
          Nome
        </label>
        <input
          id="nome-atualizacoes"
          type="text"
          required
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Seu nome"
          className="h-12 rounded border border-slate-300 bg-white px-4 text-base outline-none transition focus:border-[#062a5f] focus:ring-2 focus:ring-blue-100"
        />

        <label htmlFor="email-atualizacoes" className="sr-only">
          E-mail
        </label>
        <input
          id="email-atualizacoes"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Seu e-mail"
          className="h-12 rounded border border-slate-300 bg-white px-4 text-base outline-none transition focus:border-[#062a5f] focus:ring-2 focus:ring-blue-100"
        />

        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-12 items-center justify-center rounded bg-[#062a5f] px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {status === "loading" ? "Enviando..." : "Acompanhar"}
        </button>
      </form>

      {status === "success" && (
        <p className="mt-3 text-sm font-semibold text-green-700">
          Inscrição realizada com sucesso.
        </p>
      )}

      {status === "duplicate" && (
        <p className="mt-3 text-sm font-semibold text-amber-700">
          Este e-mail já acompanha esta legislação.
        </p>
      )}

      {status === "error" && (
        <p className="mt-3 text-sm font-semibold text-red-700">
          Não foi possível realizar a inscrição. Tente novamente.
        </p>
      )}
    </section>
  );
}
