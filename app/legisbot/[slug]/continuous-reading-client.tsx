"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegisBotOverlay } from "@/components/legisbot-overlay";
import { continuousBlockAnchor, referenceIdFromHash } from "@/lib/legisbot/continuous-reading-core";
import styles from "./continuous-reading.module.css";

type HierarchyNode = { id: number; type: string; name: string };
type Reference = { id: string; slug: string; ordem: string; identificacao: string; sourceQuestionId: string | null; prepared: boolean; hierarchy: HierarchyNode[] };
type Block = Reference & { legislation: string };
type Integrity = { totalQuestions: number; linkedQuestions: number; pendingQuestions: number; coveragePercent: number; availableBlocks: number; readingAvailable: boolean; construction: boolean; completeness: null; resolutions: Array<{ questionId: string; status: string; reason: string | null }> };
type TocNode = { key: string; label: string; reference: Reference; children: TocNode[] };

const PAGE_SIZE = 30;

function structureTree(references: Reference[]): TocNode[] {
  const roots: TocNode[] = [];
  const childrenByPath = new Map<string, TocNode[]>([["root", roots]]);
  for (const reference of references) {
    let parentPath = "root";
    for (const node of reference.hierarchy) {
      const path = `${parentPath}/${node.type}:${node.id}`;
      const siblings = childrenByPath.get(parentPath) ?? roots;
      let item = siblings.find((candidate) => candidate.key === path);
      if (!item) {
        item = { key: path, label: node.name, reference, children: [] };
        siblings.push(item);
        childrenByPath.set(path, item.children);
      }
      parentPath = path;
    }
  }
  return roots;
}

function StructureItems({ nodes, onNavigate }: { nodes: TocNode[]; onNavigate: (reference: Reference) => void }) {
  return <ol>{nodes.map((node) => <li key={node.key}><a href={`#${continuousBlockAnchor(node.reference.id)}`} onClick={() => onNavigate(node.reference)}>{node.label}</a>{node.children.length ? <StructureItems nodes={node.children} onNavigate={onNavigate} /> : null}</li>)}</ol>;
}

function TableOfContents({ references, onNavigate }: { references: Reference[]; onNavigate: (reference: Reference) => void }) {
  const nodes = structureTree(references);
  return nodes.length ? <StructureItems nodes={nodes} onNavigate={onNavigate} /> : <p>Estrutura ainda não informada.</p>;
}

export default function ContinuousReadingClient({ slug, title, references, initialBlocks, integrity, initialTab }: { slug: string; title: string; references: Reference[]; initialBlocks: Block[]; integrity: Integrity; initialTab: "legisbot" | "community" | "highlights" }) {
  const prepared = useMemo(() => references.filter((reference) => reference.prepared), [references]);
  const [blocks, setBlocks] = useState(() => new Map(initialBlocks.map((block) => [block.id, block])));
  const [loadingPages, setLoadingPages] = useState<Set<number>>(() => new Set());
  const [failedPages, setFailedPages] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<Block | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const requestedPagesRef = useRef(new Set<number>());

  const loadPage = useCallback(async (page: number) => {
    if (requestedPagesRef.current.has(page)) return;
    const offset = page * PAGE_SIZE;
    if (offset >= prepared.length) return;
    requestedPagesRef.current.add(page);
    setFailedPages((current) => { const next = new Set(current); next.delete(page); return next; });
    setLoadingPages((current) => new Set(current).add(page));
    try {
      const response = await fetch(`/api/legisbot/${encodeURIComponent(slug)}/references?offset=${offset}&limit=${PAGE_SIZE}`, { cache: "no-store" });
      const result = await response.json() as { blocks?: Block[] };
      if (!response.ok || !result.blocks) throw new Error("load_failed");
      setBlocks((current) => {
        const next = new Map(current);
        for (const block of result.blocks ?? []) next.set(block.id, block);
        return next;
      });
    } catch {
      setFailedPages((current) => new Set(current).add(page));
    } finally {
      requestedPagesRef.current.delete(page);
      setLoadingPages((current) => { const next = new Set(current); next.delete(page); return next; });
    }
  }, [prepared.length, slug]);

  const navigate = useCallback((reference: Reference) => {
    const index = prepared.findIndex((item) => item.id === reference.id);
    if (index >= 0 && !blocks.has(reference.id)) void loadPage(Math.floor(index / PAGE_SIZE));
    setFocusedId(reference.id);
  }, [blocks, loadPage, prepared]);

  useEffect(() => {
    const referenceId = referenceIdFromHash(window.location.hash);
    if (!referenceId) return;
    const index = prepared.findIndex((item) => item.id === referenceId);
    if (index < 0) return;
    setFocusedId(referenceId);
    if (!blocks.has(referenceId)) void loadPage(Math.floor(index / PAGE_SIZE));
  }, [blocks, loadPage, prepared]);

  useEffect(() => {
    if (!focusedId || !blocks.has(focusedId)) return;
    const element = document.getElementById(continuousBlockAnchor(focusedId));
    if (!element) return;
    element.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const timer = window.setTimeout(() => setFocusedId((current) => current === focusedId ? null : current), 2600);
    return () => window.clearTimeout(timer);
  }, [blocks, focusedId]);

  useEffect(() => {
    if (!contentRef.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const page = Number((entry.target as HTMLElement).dataset.loadPage);
        if (Number.isSafeInteger(page)) void loadPage(page);
      }
    }, { rootMargin: "700px 0px" });
    contentRef.current.querySelectorAll<HTMLElement>("[data-load-page]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [blocks, loadPage]);

  function openBlock(block: Block, trigger: HTMLElement) {
    returnFocusRef.current = trigger;
    setSelected(block);
  }

  function closeOverlay() {
    setSelected(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  function openFromArticle(block: Block, article: HTMLElement) {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    openBlock(block, article);
  }

  return <div className={styles.page}>
    <main className={styles.shell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>LegisBot · Leitura contínua</p>
        <h1>{title}</h1>
        <p>Leia os dispositivos disponíveis em sequência e abra o aprofundamento quando precisar.</p>
        <div className={styles.statusRow}>
          <span className={styles.badge}>{integrity.coveragePercent}% das questões vinculadas</span>
          <span className={`${styles.badge} ${styles.badgeMuted}`}>Legislação em construção</span>
          <span className={`${styles.badge} ${styles.badgeMuted}`}>Completude não verificada</span>
        </div>
      </header>
      <details className={styles.mobileToc}><summary>Sumário da legislação</summary><TableOfContents references={prepared} onNavigate={navigate} /></details>
      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="Sumário da legislação"><h2>Sumário</h2><TableOfContents references={prepared} onNavigate={navigate} /></nav>
        <section ref={contentRef} className={styles.content} aria-label="Texto da legislação">
          {prepared.map((reference, index) => {
            const block = blocks.get(reference.id);
            const page = Math.floor(index / PAGE_SIZE);
            return <article
              key={reference.id}
              id={continuousBlockAnchor(reference.id)}
              data-load-page={block ? undefined : page}
              className={`${styles.block} ${block ? styles.blockInteractive : ""} ${focusedId === reference.id ? styles.blockFocused : ""}`}
              tabIndex={block ? 0 : undefined}
              aria-label={block ? `${reference.identificacao}. Abrir aprofundamento.` : undefined}
              onClick={block ? (event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                openFromArticle(block, event.currentTarget);
              } : undefined}
              onKeyDown={block ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                openBlock(block, event.currentTarget);
              } : undefined}
            >
              {block ? <div className={styles.legalHtml} dangerouslySetInnerHTML={{ __html: block.legislation }} /> : <div className={styles.placeholder} aria-busy={loadingPages.has(page)}><span className={styles.srOnly}>{failedPages.has(page) ? "Não foi possível carregar este bloco." : "Carregando texto legislativo"}</span><div className={styles.placeholderLine}/><div className={styles.placeholderLine}/>{failedPages.has(page) ? <button type="button" className={styles.retry} onClick={() => void loadPage(page)}>Tentar carregar novamente</button> : null}</div>}
            </article>;
          })}
        </section>
      </div>
    </main>
    {selected ? <LegisBotOverlay slug={slug} question={{ ordem: selected.ordem, titulo: title, assunto: selected.identificacao, legislacao: selected.legislation }} initialTab={initialTab} onClose={closeOverlay} /> : null}
  </div>;
}
