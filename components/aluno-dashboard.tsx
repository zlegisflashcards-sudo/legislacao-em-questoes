"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Aluno } from "@/lib/alunos";
import { buscarOuCriarAluno } from "@/lib/alunos";
import { supabase } from "@/lib/supabase";

export function AlunoDashboard() {
  const router = useRouter();
  const [aluno, setAluno] = useState<Aluno | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;

    async function carregarAluno() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      try {
        const alunoAtual = await buscarOuCriarAluno(data.user);

        if (ativo) {
          setAluno(alunoAtual);
        }
      } catch {
        if (ativo) {
          setErro("Nao foi possivel carregar sua Area do Aluno.");
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarAluno();

    return () => {
      ativo = false;
    };
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (carregando) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-600">
          Carregando sua Area do Aluno...
        </p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm font-medium text-red-800">
        {erro}
      </div>
    );
  }

  if (!aluno) {
    return null;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
          Area do Aluno
        </p>
        <nav className="mt-5 space-y-2 text-sm font-semibold text-slate-700">
          <a className="block rounded bg-slate-100 px-3 py-2 text-slate-950" href="/aluno">
            Inicio
          </a>
          <span className="block rounded px-3 py-2 text-slate-400">Perfil</span>
          <span className="block rounded px-3 py-2 text-slate-400">
            Meus produtos
          </span>
          <span className="block rounded px-3 py-2 text-slate-400">
            Fidelidade
          </span>
        </nav>
      </aside>

      <section className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">
                Bem-vindo ao Legis Flashcards
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950">
                {aluno.nome || "Aluno"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Esta e a base da sua nova Area do Aluno. As proximas fases vao
                conectar produtos, compras e beneficios.
              </p>
            </div>

            <button
              type="button"
              onClick={sair}
              className="rounded border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
            >
              Sair
            </button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">Perfil</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">E-mail</dt>
                <dd className="mt-1 text-slate-900">{aluno.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Telefone</dt>
                <dd className="mt-1 text-slate-900">
                  {aluno.telefone || "Nao informado"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">CPF</dt>
                <dd className="mt-1 text-slate-900">
                  {aluno.cpf || "Nao informado"}
                </dd>
              </div>
            </dl>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-950">
              Estrutura da V2
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              <li>Cadastro e login ativos pelo Supabase Auth.</li>
              <li>Perfil vinculado ao usuario autenticado.</li>
              <li>Base pronta para produtos adquiridos na Fase 2.</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
