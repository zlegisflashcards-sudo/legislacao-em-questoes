"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegisBotOverlay } from "@/components/legisbot-overlay";
import { continuousBlockAnchor, referenceIdFromHash } from "@/lib/legisbot/continuous-reading-core";
import type { LegisBotHighlight } from "@/lib/legisbot-highlights";
import styles from "./continuous-reading.module.css";

type HierarchyNode = { id: number; type: string; name: string };
type Priority = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";
type Reference = { id: string; slug: string; ordem: string; identificacao: string; sourceQuestionId: string | null; prepared: boolean; hierarchy: HierarchyNode[]; priority: Priority; recent: boolean; linkedQuestions: number };
type Block = Reference & { legislation: string };
type TocNode = { key: string; label: string; reference: Reference; children: TocNode[]; referenceIds: string[] };

const PAGE_SIZE = 30;
const PRIORITY_ORDER: Priority[] = ["muito_alta", "alta", "media", "baixa", "nao_mapeado"];
const PRIORITY_LABELS: Record<Priority, string> = {
  muito_alta: "Prioridade muito alta",
  alta: "Prioridade alta",
  media: "Prioridade média",
  baixa: "Prioridade baixa",
  nao_mapeado: "Sem prioridade definida",
};
type IncidenceBand = "cinza" | "amarelo" | "laranja" | "vermelho";
function incidenceBand(linkedQuestions: number): IncidenceBand {
  if (linkedQuestions >= 9) return "vermelho";
  if (linkedQuestions >= 5) return "laranja";
  if (linkedQuestions >= 3) return "amarelo";
  return "cinza";
}

function FlameIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M18.3 3.5c1.1 5.3-2.2 7.3-3.8 10.1-1.2-1.1-1.8-2.5-1.7-4.3-4 3.2-6.3 7-5.4 11.1.8 4 4.2 7.1 8.6 7.1 4.8 0 8.7-3.8 8.7-8.5 0-5.6-3.8-10.6-6.4-15.5Z"/><path d="M17.3 16.4c.4 2-1.2 3-2.1 4.2-.6-.6-1-1.4-1-2.2-1.6 1.4-2.4 3-2 4.8.4 1.8 1.9 3.1 3.9 3.1 2.2 0 4-1.7 4-3.8 0-2.5-1.5-4.6-2.8-6.1Z"/></svg>;
}

function ScannerIcon({ active = false }: { active?: boolean }) {
  return <span className={`${styles.scannerIcon} ${active ? styles.scannerIconActive : ""}`} aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M7 11V6h5M20 6h5v5M25 21v5h-5M12 26H7v-5"/><path d="M11 10h10v12H11z"/><path d="M13.5 14h5M13.5 17h5"/></svg><i /></span>;
}

function LegisBotGuide({ title, mode, adminPreview }: { title: string; mode: "mapa" | "leitura"; adminPreview: boolean }) {
  if (adminPreview) return <header className={styles.hero}><p className={styles.eyebrow}>Base Legislativa · Prévia</p><h1>{title}</h1><p>Revise os dispositivos preparados e abra cada bloco na Base Legislativa.</p></header>;
  const mapMode = mode === "mapa";
  return <header className={`${styles.hero} ${styles.botHero}`}>
    <div className={styles.botAvatar} aria-hidden="true"><span>🤖</span><i>{mapMode ? <FlameIcon /> : <ScannerIcon active />}</i></div>
    <div className={styles.botSpeech}>
      <p className={styles.eyebrow}>Lei Interativa · LegisBot</p>
      <h1>{title}</h1>
      <p>{mapMode ? "Eu organizei os dispositivos pela quantidade de questões. Comece pelos pontos mais quentes e toque em um artigo para aprofundar." : "Vamos percorrer a lei inteira. Toque em qualquer dispositivo para grifar, comentar ou pedir minha explicação."}</p>
    </div>
  </header>;
}

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
        item = { key: path, label: node.name, reference, children: [], referenceIds: [] };
        siblings.push(item);
        childrenByPath.set(path, item.children);
      }
      item.referenceIds.push(reference.id);
      parentPath = path;
    }
  }
  return roots;
}

function StructureItems({ nodes, activeId, onNavigate }: { nodes: TocNode[]; activeId: string | null; onNavigate: (reference: Reference) => void }) {
  return <ol>{nodes.map((node) => {
    const active = Boolean(activeId && node.referenceIds.includes(activeId));
    return <li key={node.key} className={styles.tocSection}>
      <a className={active ? styles.tocActive : undefined} aria-current={active ? "location" : undefined} href={`#${continuousBlockAnchor(node.reference.id)}`} onClick={() => onNavigate(node.reference)}>{node.label}</a>
      {node.children.length ? <StructureItems nodes={node.children} activeId={activeId} onNavigate={onNavigate} /> : null}
    </li>;
  })}</ol>;
}

function TableOfContents({ references, activeId, onNavigate }: { references: Reference[]; activeId: string | null; onNavigate: (reference: Reference) => void }) {
  const nodes = structureTree(references);
  return nodes.length ? <StructureItems nodes={nodes} activeId={activeId} onNavigate={onNavigate} /> : <p>Estrutura ainda não informada.</p>;
}

function hierarchyIntroducedBy(reference: Reference, previous?: Reference) {
  const sharedDepth = reference.hierarchy.findIndex((node, index) => {
    const previousNode = previous?.hierarchy[index];
    return !previousNode || previousNode.id !== node.id || previousNode.type !== node.type;
  });
  return sharedDepth < 0 ? [] : reference.hierarchy.slice(sharedDepth);
}

function ReadingStructureHeadings({ nodes }: { nodes: HierarchyNode[] }) {
  if (!nodes.length) return null;
  return <header className={styles.readingStructure} aria-label="Estrutura da legislação">
    {nodes.map((node) => <p key={`${node.type}:${node.id}`} data-structure-type={node.type}>{node.name}</p>)}
  </header>;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function InteractiveLawMap({ references, onOpen }: { references: Reference[]; onOpen: (reference: Reference) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Priority | "todas">("todas");
  const normalizedQuery = normalizeSearch(query);
  const ordered = useMemo(() => [...references]
    .filter((reference) => reference.linkedQuestions > 0 || reference.priority !== "nao_mapeado" || reference.recent)
    .filter((reference) => filter === "todas" || reference.priority === filter)
    .filter((reference) => !normalizedQuery || normalizeSearch(`${reference.identificacao} ${reference.ordem} ${reference.hierarchy.map((node) => node.name).join(" ")}`).includes(normalizedQuery))
    .sort((first, second) => PRIORITY_ORDER.indexOf(first.priority) - PRIORITY_ORDER.indexOf(second.priority) || first.ordem.localeCompare(second.ordem)), [filter, normalizedQuery, references]);

  return <section className={styles.mapPanel} aria-labelledby="interactive-map-title">
    <header className={styles.modeIntroduction}>
      <p>Estudo focado</p>
      <h2 id="interactive-map-title">Mapa de prioridade</h2>
      <span>Comece pelos dispositivos mais importantes para sua revisão e aprofunde cada trecho sem sair da lei.</span>
    </header>
    <div className={styles.mapTools}>
      <label><span className={styles.srOnly}>Pesquisar dispositivo</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar artigo ou assunto..." /></label>
      <label><span className={styles.srOnly}>Filtrar por prioridade</span><select value={filter} onChange={(event) => setFilter(event.target.value as Priority | "todas")}><option value="todas">Todas as prioridades</option>{PRIORITY_ORDER.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}</select></label>
    </div>
    <div className={styles.priorityLegend} aria-label="Legenda do mapa"><span className={styles.priorityGradient} aria-hidden="true" /><span>Incidência: cinza, amarelo (3+), laranja (5+) e vermelho (9+)</span><span className={styles.recentLegend}><i aria-hidden="true">⚑</i>Conteúdo recente</span></div>
    {ordered.length ? <ol className={styles.mapGrid} aria-live="polite">{ordered.map((reference) => <li key={reference.id}>
      <a href={`#${continuousBlockAnchor(reference.id)}`} className={`${styles.mapArticle} ${styles[`incidence_${incidenceBand(reference.linkedQuestions)}`]} ${reference.recent ? styles.mapArticleRecent : ""}`} title={`${PRIORITY_LABELS[reference.priority]}${reference.recent ? " · Conteúdo recente" : ""}`} onClick={(event) => { event.preventDefault(); onOpen(reference); }}>
        {reference.recent ? <span className={styles.cardRecentFlag} role="img" aria-label="Conteúdo recente" title="Conteúdo recente">⚑</span> : null}
        <strong>{reference.identificacao}</strong>
      </a>
    </li>)}</ol> : <p className={styles.mapEmpty}>Nenhum dispositivo encontrado com esses filtros.</p>}
  </section>;
}

function ContinuousLegalHtml({ html, highlights }: { html: string; highlights: LegisBotHighlight[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = html;
    for (const highlight of [...highlights].sort((a, b) => a.start - b.start)) {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        nodes.push(node as Text);
        node = walker.nextNode();
      }
      const renderedText = nodes.map((item) => item.data).join("");
      const matches: number[] = [];
      let match = renderedText.indexOf(highlight.text);
      while (match >= 0) {
        matches.push(match);
        match = renderedText.indexOf(highlight.text, match + 1);
      }
      let renderedStart: number | undefined = matches.sort((a, b) => Math.abs(a - highlight.start) - Math.abs(b - highlight.start))[0];
      let renderedEnd: number | undefined = renderedStart === undefined ? undefined : renderedStart + highlight.text.length;
      if (renderedStart === undefined) {
        const fragments = highlight.text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
        let cursor = 0;
        for (const fragment of fragments) {
          const fragmentStart = renderedText.indexOf(fragment, cursor);
          if (fragmentStart < 0) {
            renderedStart = undefined;
            renderedEnd = undefined;
            break;
          }
          if (renderedStart === undefined) renderedStart = fragmentStart;
          renderedEnd = fragmentStart + fragment.length;
          cursor = renderedEnd;
        }
      }
      if (renderedStart === undefined || renderedEnd === undefined) continue;
      let offset = 0;
      let startNode: Text | null = null;
      let endNode: Text | null = null;
      let startOffset = 0;
      let endOffset = 0;
      for (const textNode of nodes) {
        const nextOffset = offset + textNode.data.length;
        if (!startNode && renderedStart >= offset && renderedStart <= nextOffset) {
          startNode = textNode;
          startOffset = renderedStart - offset;
        }
        if (renderedEnd >= offset && renderedEnd <= nextOffset) {
          endNode = textNode;
          endOffset = renderedEnd - offset;
          break;
        }
        offset = nextOffset;
      }
      if (!startNode || !endNode) continue;
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      const mark = document.createElement("mark");
      mark.className = `personal-highlight ${highlight.color}`;
      mark.dataset.highlightId = highlight.id;
      mark.append(range.extractContents());
      range.insertNode(mark);
    }
  }, [highlights, html]);

  return <div ref={containerRef} className={styles.legalHtml} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ContinuousReadingClient({ slug, title, references, initialBlocks, initialTab, adminPreview = false }: { slug: string; title: string; references: Reference[]; initialBlocks: Block[]; initialTab: "legisbot" | "community" | "highlights"; adminPreview?: boolean }) {
  const prepared = useMemo(() => references.filter((reference) => reference.prepared), [references]);
  const [studyMode, setStudyMode] = useState<"mapa" | "leitura">(adminPreview ? "leitura" : "mapa");
  const [blocks, setBlocks] = useState(() => new Map(initialBlocks.map((block) => [block.id, block])));
  const [blockHighlights, setBlockHighlights] = useState<Map<string, LegisBotHighlight[]>>(() => new Map());
  const [loadingPages, setLoadingPages] = useState<Set<number>>(() => new Set());
  const [failedPages, setFailedPages] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<Block | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [desktopTocOpen, setDesktopTocOpen] = useState(true);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [missingTarget, setMissingTarget] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const requestedPagesRef = useRef(new Set<number>());
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const ignoreHashRef = useRef(false);

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
    scrollBehaviorRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    setFocusedId(reference.id);
    setActiveId(reference.id);
    setMobileTocOpen(false);
  }, [blocks, loadPage, prepared]);

  const openFromMap = useCallback((reference: Reference) => {
    ignoreHashRef.current = false;
    window.history.replaceState(window.history.state, "", `#${continuousBlockAnchor(reference.id)}`);
    setMissingTarget(false);
    setStudyMode("leitura");
    navigate(reference);
  }, [navigate]);

  const showMap = useCallback(() => {
    ignoreHashRef.current = true;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    setMissingTarget(false);
    setStudyMode("mapa");
  }, []);

  useEffect(() => {
    if (ignoreHashRef.current) return;
    const referenceId = referenceIdFromHash(window.location.hash);
    if (!referenceId) return;
    if (!adminPreview) setStudyMode("leitura");
    const index = prepared.findIndex((item) => item.id === referenceId);
    if (index < 0) { setMissingTarget(true); return; }
    setMissingTarget(false);
    scrollBehaviorRef.current = "auto";
    setFocusedId(referenceId);
    setActiveId(referenceId);
    if (!blocks.has(referenceId)) void loadPage(Math.floor(index / PAGE_SIZE));
  }, [adminPreview, blocks, loadPage, prepared]);

  useEffect(() => {
    if (adminPreview) return;
    const openHashTarget = () => {
      ignoreHashRef.current = false;
      const referenceId = referenceIdFromHash(window.location.hash);
      if (!referenceId) return;
      setStudyMode("leitura");
      const reference = prepared.find((item) => item.id === referenceId);
      if (reference) openFromMap(reference);
      else setMissingTarget(true);
    };
    window.addEventListener("hashchange", openHashTarget);
    return () => window.removeEventListener("hashchange", openHashTarget);
  }, [adminPreview, openFromMap, prepared]);

  useEffect(() => {
    if (!mobileTocOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileTocOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [mobileTocOpen]);

  useEffect(() => {
    if (!focusedId || !blocks.has(focusedId)) return;
    const element = document.getElementById(continuousBlockAnchor(focusedId));
    if (!element) return;
    element.scrollIntoView({ block: "start", behavior: scrollBehaviorRef.current });
    const timer = window.setTimeout(() => setFocusedId((current) => current === focusedId ? null : current), 2600);
    return () => window.clearTimeout(timer);
  }, [blocks, focusedId, studyMode]);

  useEffect(() => {
    if (!contentRef.current || !("IntersectionObserver" in window)) return;
    const visible = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry);
      const current = [...visible.values()]
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => Math.abs(a.boundingClientRect.top - 112) - Math.abs(b.boundingClientRect.top - 112))[0];
      if (current) setActiveId(referenceIdFromHash(`#${current.target.id}`));
    }, { rootMargin: "-96px 0px -68% 0px", threshold: [0, .01, .25] });
    contentRef.current.querySelectorAll<HTMLElement>(`[id^="bloco-"]`).forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [prepared]);

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

  const updateBlockHighlights = useCallback((ordem: string, items: LegisBotHighlight[]) => {
    const reference = prepared.find((item) => item.ordem === ordem);
    if (!reference) return;
    setBlockHighlights((current) => {
      const currentItems = current.get(reference.id) ?? [];
      if (currentItems.length === items.length && currentItems.every((item, index) => (
        item.id === items[index]?.id
        && item.start === items[index]?.start
        && item.end === items[index]?.end
        && item.color === items[index]?.color
        && item.updatedAt === items[index]?.updatedAt
      ))) return current;
      const next = new Map(current);
      next.set(reference.id, items);
      return next;
    });
  }, [prepared]);

  function openFromArticle(block: Block, article: HTMLElement) {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    if (adminPreview) {
      window.location.assign(`/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(block.ordem)}?aba=artigo&lei=${encodeURIComponent(slug.toLowerCase())}`);
      return;
    }
    openBlock(block, article);
  }

  function activateBlock(block: Block, trigger: HTMLElement) {
    if (adminPreview) {
      window.location.assign(`/admin/artigos/${encodeURIComponent(slug.toLowerCase())}/${encodeURIComponent(block.ordem)}?aba=artigo&lei=${encodeURIComponent(slug.toLowerCase())}`);
      return;
    }
    openBlock(block, trigger);
  }

  return <div className={styles.page}>
    <main className={styles.shell}>
      <LegisBotGuide title={title} mode={studyMode} adminPreview={adminPreview} />
      {!adminPreview ? <div className={styles.studyModes} role="tablist" aria-label="Modos da Lei Interativa">
        <button type="button" role="tab" aria-selected={studyMode === "mapa"} className={studyMode === "mapa" ? styles.studyModeActive : undefined} onClick={showMap}><span className={styles.modeIcon}><FlameIcon /></span><span><strong>Mapa</strong><small>Estudo por prioridade</small></span></button>
        <button type="button" role="tab" aria-selected={studyMode === "leitura"} className={studyMode === "leitura" ? styles.studyModeActive : undefined} onClick={() => setStudyMode("leitura")}><span className={styles.modeIcon}><ScannerIcon active={studyMode === "leitura"} /></span><span><strong>Leitura</strong><small>Estude toda a lei</small></span></button>
      </div> : null}
      {!adminPreview && studyMode === "mapa" ? <InteractiveLawMap references={prepared} onOpen={openFromMap} /> : <>
        {adminPreview ? <aside className={styles.guidance} aria-label="Orientação de uso"><strong>Revise a legislação</strong><span>Toque em um bloco para abrir sua edição na Base Legislativa.</span></aside> : null}
        {missingTarget ? <p className={styles.targetNotice} role="status">Este dispositivo não está disponível nesta versão da legislação. Continue pelo sumário.</p> : null}
        <div className={styles.mobileTocBar}><button type="button" aria-expanded={mobileTocOpen} aria-controls="legisbot-mobile-toc" onClick={() => setMobileTocOpen((open) => !open)}>☰ <span>Sumário</span></button><span className={styles.mobileTocPrompt}>📖 Clique na Lei</span><span className={styles.mobileTocCurrent} aria-live="polite">{prepared.find((item) => item.id === activeId)?.identificacao ?? "Início da lei"}</span></div>
        {mobileTocOpen ? <div className={styles.mobileTocBackdrop} onClick={() => setMobileTocOpen(false)}><nav id="legisbot-mobile-toc" className={styles.mobileTocPanel} aria-label="Sumário da legislação" onClick={(event) => event.stopPropagation()}><header><div><h2>Sumário</h2><p>Procurando um artigo? Escolha aqui e eu te levo até ele.</p></div><button type="button" aria-label="Fechar sumário" onClick={() => setMobileTocOpen(false)}>×</button></header><TableOfContents references={prepared} activeId={activeId} onNavigate={navigate} /></nav></div> : null}
        <div className={`${styles.layout} ${desktopTocOpen ? "" : styles.layoutTocClosed}`}>
        <aside className={`${styles.tocShell} ${desktopTocOpen ? "" : styles.tocShellClosed}`}><button type="button" className={styles.tocToggle} aria-expanded={desktopTocOpen} onClick={() => setDesktopTocOpen((open) => !open)}>{desktopTocOpen ? "← Recolher" : "☰"}<span className={styles.srOnly}> sumário</span></button>{desktopTocOpen ? <nav className={styles.toc} aria-label="Sumário da legislação"><h2>Sumário</h2><TableOfContents references={prepared} activeId={activeId} onNavigate={navigate} /></nav> : null}</aside>
        <section ref={contentRef} className={styles.content} aria-label="Texto da legislação">
          {prepared.map((reference, index) => {
            const block = blocks.get(reference.id);
            const page = Math.floor(index / PAGE_SIZE);
            const introducedHierarchy = hierarchyIntroducedBy(reference, prepared[index - 1]);
            return <Fragment key={reference.id}>
              <ReadingStructureHeadings nodes={introducedHierarchy} />
              <article
              id={continuousBlockAnchor(reference.id)}
              data-load-page={block ? undefined : page}
              className={`${styles.block} ${styles[`readingPriority_${reference.priority}`]} ${block ? styles.blockInteractive : ""} ${focusedId === reference.id ? styles.blockFocused : ""}`}
              tabIndex={block ? 0 : undefined}
              aria-label={block ? `${reference.identificacao}. Abrir aprofundamento.` : undefined}
              onClick={block ? (event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                openFromArticle(block, event.currentTarget);
              } : undefined}
              onKeyDown={block ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                activateBlock(block, event.currentTarget);
              } : undefined}
            >
              {block ? <ContinuousLegalHtml html={block.legislation} highlights={blockHighlights.get(reference.id) ?? []} /> : <div className={styles.placeholder} aria-busy={loadingPages.has(page)}><span className={styles.srOnly}>{failedPages.has(page) ? "Não foi possível carregar este bloco." : "Carregando texto legislativo"}</span><div className={styles.placeholderLine}/><div className={styles.placeholderLine}/>{failedPages.has(page) ? <button type="button" className={styles.retry} onClick={() => void loadPage(page)}>Tentar carregar novamente</button> : null}</div>}
              </article>
            </Fragment>;
          })}
        </section>
        </div>
      </>}
    </main>
    {selected && !adminPreview ? <LegisBotOverlay slug={slug} question={{ ordem: selected.ordem, titulo: title, assunto: selected.identificacao, legislacao: selected.legislation }} initialTab={initialTab} onHighlightsChange={updateBlockHighlights} onClose={closeOverlay} /> : null}
  </div>;
}
