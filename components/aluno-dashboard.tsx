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
  const [cupomCopiado, setCupomCopiado] = useState(false);

  const produtosMockados = [
    "Código Penal",
    "Constituição Federal",
    "Lei 13.022",
  ];
  const pontosMockados = 120;
  const nivelMockado = "Estudioso";
  const cupomMockado = "LEGIS20";

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

  async function copiarCupom() {
    await navigator.clipboard.writeText(cupomMockado);
    setCupomCopiado(true);
    window.setTimeout(() => setCupomCopiado(false), 1800);
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
                Este é o painel inicial do Clube de Benefícios. Os dados abaixo
                são temporários enquanto a integração real de produtos, pontos e
                cupons ainda não entra em produção.
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
            <p className="text-sm font-semibold text-blue-700">Meus Produtos</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              {produtosMockados.length} produtos
            </h2>
            <ul className="mt-4 space-y-2 text-sm font-medium text-slate-700">
              {produtosMockados.map((produto) => (
                <li
                  key={produto}
                  className="rounded border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  {produto}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-blue-700">Pontos</p>
            <h2 className="mt-2 text-4xl font-bold text-slate-950">
              {pontosMockados}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Pontuação temporária para demonstrar a experiência do Clube de
              Benefícios.
            </p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-blue-700">Nível</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-950">
              {nivelMockado}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Nível mockado enquanto as regras reais de fidelidade ainda não
              foram implementadas.
            </p>
          </article>

          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-blue-700">Cupom atual</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <code className="rounded border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-lg font-bold text-blue-800">
                {cupomMockado}
              </code>
              <button
                type="button"
                onClick={copiarCupom}
                className="rounded bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"
              >
                {cupomCopiado ? "Cupom copiado" : "Copiar cupom"}
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Cupom demonstrativo. A gestão real de cupons fica para fase
              futura.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
