"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  filterStudentLaws,
  studentLawShortNameForDisplay,
  type StudentLaw,
} from "@/lib/student-laws";
import { supabase } from "@/lib/supabase";

type StructureQuestion = {
  id: string;
  law_id: number;
  ordem: number;
  titulo: string | null;
  capitulo: string | null;
  secao: string | null;
  subsecao: string | null;
  assunto: string | null;
  structure_id: number | null;
};

type StoredStructureNode = { id: number; parent_id: number | null; tipo: TreeLevel; nome: string; ordem: number };

type QuestionLaw = StudentLaw & {
  questionsAvailable: boolean;
  questions: StructureQuestion[];
  structure?: StoredStructureNode[];
};

type StructureResponse = {
  laws?: QuestionLaw[];
  message?: string;
};

type TreeLevel =
  | "titulo"
  | "capitulo"
  | "secao"
  | "subsecao";

type TreeNode = {
  level: TreeLevel;
  label: string;
  count: number;
  children: TreeNode[];
  filters: Partial<Record<TreeLevel, string>>;
  structureId?: number;
};

const LEVELS: TreeLevel[] = [
  "titulo",
  "capitulo",
  "secao",
  "subsecao",
];

export function LegisQuestoesClient() {
  const [laws, setLaws] = useState<QuestionLaw[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;

        if (!token) {
          window.location.replace(
            "/conta?modo=login&retorno=%2Fquestoes"
          );
          return;
        }

        const response = await fetch("/api/questoes/estrutura", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = (await response.json()) as StructureResponse;

        if (!response.ok || !Array.isArray(result.laws)) {
          throw new Error(
            result.message || "Não foi possível carregar os baralhos."
          );
        }

        if (active) {
          setLaws(result.laws);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os baralhos."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  const filteredLaws = useMemo(
    () => filterStudentLaws(laws, search) as QuestionLaw[],
    [laws, search]
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header>
        <p className="text-sm font-black uppercase tracking-wide text-blue-700">
          Legis Flashcards
        </p>

        <h1 className="mt-1 text-3xl font-black tracking-tight text-[#062a5f] sm:text-4xl">
          Legis Questões
        </h1>

        <p className="mt-3 max-w-2xl text-slate-600">
          Escolha uma legislação ou um tópico específico para começar a
          resolver questões.
        </p>
      </header>

      {!loading && !error && laws.length > 0 ? (
        <section className="mt-8">
          <label
            htmlFor="questoes-search"
            className="text-sm font-black text-slate-800"
          >
            Pesquisar legislação
          </label>

          <input
            id="questoes-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou número da lei"
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </section>
      ) : null}

      {loading ? (
        <div className="mt-8 rounded-2xl border border-blue-100 bg-white p-8 text-slate-600 shadow-sm">
          Carregando seus baralhos...
        </div>
      ) : null}

      {!loading && error ? (
        <div
          role="alert"
          className="mt-8 rounded-2xl border border-red-200 bg-white p-6 text-red-700 shadow-sm"
        >
          <p>{error}</p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-blue-700 px-5 py-3 font-black text-white"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!loading && !error && filteredLaws.length > 0 ? (
        <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white">
  <div className="flex items-center border-b border-slate-200 px-3 py-2 text-sm font-black text-slate-900">
    <span className="flex-1">Baralho</span>
    <span className="w-20 text-right">Questões</span>
  </div>

  {filteredLaws.map((law) => (
    <LawDeck key={law.id} law={law} />
  ))}
</section>
      ) : null}

      {!loading && !error && laws.length > 0 && filteredLaws.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-black text-[#062a5f]">
            Nenhuma legislação encontrada
          </h2>

          <p className="mt-2 text-slate-600">
            Tente pesquisar por outro nome ou código.
          </p>
        </div>
      ) : null}

      {!loading && !error && laws.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-black text-[#062a5f]">
            Nenhuma legislação disponível
          </h2>
        </div>
      ) : null}
    </main>
  );
}

function LawDeck({ law }: { law: QuestionLaw }) {
  const [open, setOpen] = useState(false);
  const shortName = studentLawShortNameForDisplay(law);
  const tree = law.structure?.length ? buildStoredTree(law.structure, law.questions) : buildTree(law.questions);

  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <div className="flex min-h-10 items-center gap-2 px-3 py-1.5 hover:bg-slate-100">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex h-7 w-7 shrink-0 items-center justify-center text-base font-bold text-slate-700"
          aria-label={open ? "Recolher baralho" : "Expandir baralho"}
        >
          {open ? "−" : "+"}
        </button>

        <Link
          href={`/questoes/${encodeURIComponent(law.slug)}/estudar`}
          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:text-blue-700"
        >
          {law.titulo}
          {shortName ? ` (${shortName})` : ""}
        </Link>

        <span className="w-20 shrink-0 text-right text-sm font-medium text-blue-600">
          {law.questions.length}
        </span>
      </div>

      {open && law.questions.length > 0 ? (
        <div>
          {tree.map((node) => (
            <TreeNodeView
              key={node.structureId ? `structure:${node.structureId}` : `${node.level}:${node.label}`}
              node={node}
              slug={law.slug}
              depth={1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TreeNodeView({
  node,
  slug,
  depth,
}: {
  node: TreeNode;
  slug: string;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  const params = new URLSearchParams();

  if (node.structureId) params.set("structure_id", String(node.structureId));
  for (const level of LEVELS) {
    const value = node.filters[level];
    if (value) {
      params.set(level, value);
    }
  }

  const href =
    `/questoes/${encodeURIComponent(slug)}/estudar?${params.toString()}`;

  return (
    <div>
      <div
        className="flex min-h-9 items-center gap-2 py-1 hover:bg-slate-100"
        style={{ paddingLeft: `${12 + depth * 24}px`, paddingRight: "12px" }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((value) => !value)}
          className="flex h-6 w-6 shrink-0 items-center justify-center text-sm font-bold text-slate-600"
          aria-label={
            hasChildren
              ? open
                ? "Recolher"
                : "Expandir"
              : undefined
          }
        >
          {hasChildren ? (open ? "−" : "+") : ""}
        </button>

        <Link
          href={href}
          className="min-w-0 flex-1 truncate text-sm text-slate-800 hover:text-blue-700"
          title={node.label}
        >
          {node.label}
        </Link>

        <span className="w-20 shrink-0 text-right text-sm text-blue-600">
          {node.count}
        </span>
      </div>

      {hasChildren && open
        ? node.children.map((child) => (
            <TreeNodeView
              key={`${child.level}:${child.label}`}
              node={child}
              slug={slug}
              depth={depth + 1}
            />
          ))
        : null}
    </div>
  );
}

function StudyDeckLink({
  slug,
  label,
  count,
  filters,
  prominent = false,
}: {
  slug: string;
  label: string;
  count: number;
  filters: Partial<Record<TreeLevel, string>>;
  prominent?: boolean;
}) {
  const params = new URLSearchParams();

  for (const level of LEVELS) {
    const value = filters[level];
    if (value) {
      params.set(level, value);
    }
  }

  const query = params.toString();

  const href = query
    ? `/questoes/${encodeURIComponent(slug)}/estudar?${query}`
    : `/questoes/${encodeURIComponent(slug)}/estudar`;

  return (
    <Link
      href={href}
      className={
        prominent
          ? "flex min-h-12 items-center justify-between gap-3 rounded-xl bg-blue-700 px-4 py-3 font-black text-white transition hover:bg-blue-600"
          : "flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"
      }
    >
      <span className="min-w-0">{label}</span>

      <span
        className={
          prominent
            ? "shrink-0 text-sm text-blue-100"
            : "shrink-0 text-sm text-slate-500"
        }
      >
        {count}
      </span>
    </Link>
  );
}

function buildTree(questions: StructureQuestion[]): TreeNode[] {
  return buildLevel(questions, 0, {});
}

function buildStoredTree(nodes: StoredStructureNode[], questions: StructureQuestion[]): TreeNode[] {
  const byParent = new Map<number | null, StoredStructureNode[]>();
  for (const node of nodes) byParent.set(node.parent_id, [...(byParent.get(node.parent_id) ?? []), node]);
  const descendants = (node: StoredStructureNode): number[] => [node.id, ...(byParent.get(node.id) ?? []).flatMap(descendants)];
  const toTreeNode = (node: StoredStructureNode): TreeNode => {
    const ids = new Set(descendants(node));
    return { level: node.tipo, label: node.nome, count: questions.filter((question) => question.structure_id !== null && ids.has(question.structure_id)).length, children: (byParent.get(node.id) ?? []).map(toTreeNode), filters: {}, structureId: node.id };
  };
  return (byParent.get(null) ?? []).map(toTreeNode);
}

function buildLevel(
  questions: StructureQuestion[],
  levelIndex: number,
  parentFilters: Partial<Record<TreeLevel, string>>
): TreeNode[] {
  if (levelIndex >= LEVELS.length) {
    return [];
  }

  const level = LEVELS[levelIndex];

  const groups = new Map<string, StructureQuestion[]>();
  const withoutCurrentLevel: StructureQuestion[] = [];

  for (const question of questions) {
    const value = question[level]?.trim();

    if (!value) {
      withoutCurrentLevel.push(question);
      continue;
    }

    const existing = groups.get(value) ?? [];
    existing.push(question);
    groups.set(value, existing);
  }

  const nodes: TreeNode[] = Array.from(groups.entries()).map(
    ([label, groupQuestions]) => {
      const filters = {
        ...parentFilters,
        [level]: label,
      };

      return {
        level,
        label,
        count: groupQuestions.length,
        filters,
        children: buildLevel(
          groupQuestions,
          levelIndex + 1,
          filters
        ),
      };
    }
  );

  // Questões que não possuem esse nível continuam descendo
  // para o próximo nível existente.
  if (withoutCurrentLevel.length > 0) {
    nodes.push(
      ...buildLevel(
        withoutCurrentLevel,
        levelIndex + 1,
        parentFilters
      )
    );
  }

  return nodes;
}
