"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ProdutoV2 } from "@/lib/produtos-v2";
import {
  atualizarProdutoV2,
  cadastrarProdutoV2,
  listarProdutosV2,
} from "@/lib/produtos-v2";

type ProdutoEditando = {
  nome: string;
  tipo: string;
};

export function AdminProdutosTemporario() {
  const [produtos, setProdutos] = useState<ProdutoV2[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("");
  const [hotmartProductId, setHotmartProductId] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [editando, setEditando] = useState<Record<string, ProdutoEditando>>(
    {}
  );

  async function carregarProdutos() {
    setErro("");

    try {
      const produtosCarregados = await listarProdutosV2();
      setProdutos(produtosCarregados);
      setEditando(
        Object.fromEntries(
          produtosCarregados.map((produto) => [
            produto.id,
            {
              nome: produto.nome,
              tipo: produto.tipo,
            },
          ])
        )
      );
    } catch {
      setErro("Nao foi possivel carregar os produtos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function cadastrarProduto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro("");
    setSucesso("");
    setSalvando(true);

    try {
      await cadastrarProdutoV2({
        nome: nome.trim(),
        tipo: tipo.trim(),
        hotmart_product_id: hotmartProductId.trim(),
        ativo,
      });

      setNome("");
      setTipo("");
      setHotmartProductId("");
      setAtivo(true);
      setSucesso("Produto cadastrado.");
      await carregarProdutos();
    } catch {
      setErro("Nao foi possivel cadastrar o produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarProduto(produto: ProdutoV2) {
    const valores = editando[produto.id];

    if (!valores) {
      return;
    }

    setErro("");
    setSucesso("");

    try {
      await atualizarProdutoV2(produto.id, {
        nome: valores.nome.trim(),
        tipo: valores.tipo.trim(),
      });

      setSucesso("Produto atualizado.");
      await carregarProdutos();
    } catch {
      setErro("Nao foi possivel atualizar o produto.");
    }
  }

  async function alternarAtivo(produto: ProdutoV2) {
    setErro("");
    setSucesso("");

    try {
      await atualizarProdutoV2(produto.id, {
        ativo: !produto.ativo,
      });

      setSucesso(produto.ativo ? "Produto desativado." : "Produto ativado.");
      await carregarProdutos();
    } catch {
      setErro("Nao foi possivel alterar o status do produto.");
    }
  }

  function atualizarCampoEdicao(
    produtoId: string,
    campo: keyof ProdutoEditando,
    valor: string
  ) {
    setEditando((estadoAtual) => ({
      ...estadoAtual,
      [produtoId]: {
        ...estadoAtual[produtoId],
        [campo]: valor,
      },
    }));
  }

  return (
    <div className="bg-[#eef2f7]">
      <div className="mx-auto min-h-[calc(100vh-220px)] max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Admin temporario
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">Produtos</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Tela temporaria para desenvolvimento. Ainda nao ha autenticacao
            administrativa, Hotmart ou integracao com a V1.
          </p>
        </div>

        <form
          onSubmit={cadastrarProduto}
          className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-bold text-slate-950">
            Cadastrar produto
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-800">Nome</span>
              <input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-800">Tipo</span>
              <input
                value={tipo}
                onChange={(event) => setTipo(event.target.value)}
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-slate-800">
                hotmart_product_id
              </span>
              <input
                value={hotmartProductId}
                onChange={(event) => setHotmartProductId(event.target.value)}
                required
                className="w-full rounded border border-slate-300 px-3 py-2 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="flex items-center gap-3 self-end rounded border border-slate-200 px-3 py-2">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(event) => setAtivo(event.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-semibold text-slate-800">
                Produto ativo
              </span>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={salvando}
              className="rounded bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Cadastrar produto"}
            </button>
            {erro ? (
              <p className="text-sm font-medium text-red-700">{erro}</p>
            ) : null}
            {sucesso ? (
              <p className="text-sm font-medium text-green-700">{sucesso}</p>
            ) : null}
          </div>
        </form>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Produtos cadastrados
            </h2>
          </div>

          {carregando ? (
            <p className="p-5 text-sm font-medium text-slate-600">
              Carregando produtos...
            </p>
          ) : produtos.length === 0 ? (
            <p className="p-5 text-sm font-medium text-slate-600">
              Nenhum produto cadastrado.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {produtos.map((produto) => (
                <article key={produto.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Nome
                    </span>
                    <input
                      value={editando[produto.id]?.nome ?? produto.nome}
                      onChange={(event) =>
                        atualizarCampoEdicao(
                          produto.id,
                          "nome",
                          event.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Tipo
                    </span>
                    <input
                      value={editando[produto.id]?.tipo ?? produto.tipo}
                      onChange={(event) =>
                        atualizarCampoEdicao(
                          produto.id,
                          "tipo",
                          event.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>

                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      hotmart_product_id
                    </span>
                    <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-800">
                      {produto.hotmart_product_id}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => salvarProduto(produto)}
                      className="rounded bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => alternarAtivo(produto)}
                      className={
                        produto.ativo
                          ? "rounded border border-red-200 px-3 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                          : "rounded border border-green-200 px-3 py-2 text-sm font-bold text-green-700 transition hover:bg-green-50"
                      }
                    >
                      {produto.ativo ? "Desativar" : "Ativar"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
