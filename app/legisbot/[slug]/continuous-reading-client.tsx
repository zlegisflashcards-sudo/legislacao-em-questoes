"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { LegisBotOverlay } from "@/components/legisbot-overlay";
import { LegiscastAudioTransport, type LegiscastAudioTrack } from "@/components/legiscast-audio-player";
import { continuousBlockAnchor, referenceIdFromHash } from "@/lib/legisbot/continuous-reading-core";
import { continuousReadingAdvances, continuousReadingMarkerStorageKey, continuousReadingResumeStorageKey, readContinuousReadingMarker, resolveContinuousReadingPauseTarget, resolveContinuousReadingResume, saveContinuousReadingMarker } from "@/lib/legisbot/continuous-reading-navigation-core";
import { canLoadContinuousPage, completedContinuousPage } from "@/lib/legisbot/continuous-reading-pagination";
import type { LegisBotHighlight } from "@/lib/legisbot-highlights";
import { supabase } from "@/lib/supabase";
import styles from "./continuous-reading.module.css";

type HierarchyNode = { id: number; type: string; name: string };
type Priority = "muito_alta" | "alta" | "media" | "baixa" | "nao_mapeado";
type Reference = { id: string; slug: string; ordem: string; identificacao: string; sourceQuestionId: string | null; prepared: boolean; hierarchy: HierarchyNode[]; priority: Priority; recent: boolean; linkedQuestions: number; inactive: boolean };
type StructureCatalogItem = { id: number; parentId: number | null; type: string; name: string; order: number; status: "accessible" | "pending" | "blocked" };
type StudyUnit = { id: string; kind: "audio" | "text"; audioId: string | null; titleStructureId: number; structureIds: number[] };
type StructureAudioCoverage = { kind: "direct" | "covered"; sourceName: string };
type AudioStatus = "direct" | "editorial" | "ancestor" | "unavailable" | "ambiguous" | "not_applicable" | "loading";
type Block = Reference & { legislation: string };
type BlockText = Pick<Block, "id" | "legislation">;
type TocNode = { key: string; structure: StructureCatalogItem; reference: Reference | null; children: TocNode[]; referenceIds: string[] };

const PAGE_SIZE = 30;
const TOC_MIN_WIDTH = 220;
const TOC_DEFAULT_WIDTH = 280;
const TOC_MAX_WIDTH = 480;
const TOC_WIDTH_STORAGE_KEY = "legisbot:continuous-reading:toc-width";
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
  if (linkedQuestions >= 6) return "vermelho";
  if (linkedQuestions >= 4) return "laranja";
  if (linkedQuestions >= 2) return "amarelo";
  return "cinza";
}

function LegisBotGuide({ lawTitle, mode, adminPreview }: { lawTitle: string; mode: "mapa" | "leitura"; adminPreview: boolean }) {
  if (adminPreview) return <header className={styles.hero}><p className={styles.eyebrow}>Base Legislativa · Prévia</p><h1>{lawTitle}</h1><p>Revise os dispositivos preparados e abra cada bloco na Base Legislativa.</p></header>;
  const mapMode = mode === "mapa";
  return <header className={`${styles.hero} ${styles.botHero}`}>
    <figure className={styles.legiscastHosts}>
      <img src="/images/legiscast-hosts.png" alt="Mérvia e Tício, apresentadores do LegisCast" />
    </figure>
    <div className={styles.botSpeech}>
      <p className={styles.eyebrow}>LegisCast + Lei Interativa</p>
      <h1>{lawTitle}</h1>
      <p>{mapMode ? "Organizei os dispositivos por prioridade estatística. Comece pelos pontos mais quentes e toque em um artigo para aprofundar." : "Os apresentadores do LegisCast vão acompanhar você nessa jornada, tornando o estudo da lei mais leve, dinâmico e eficiente."}</p>
    </div>
  </header>;
}

function LegiscastPdfDownload({ slug, title, accessToken }: { slug: string; title: string; accessToken: string | null | undefined }) {
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    if (!accessToken) { setMaterialId(null); return; }
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/legisbot/${encodeURIComponent(slug)}/pdf-material`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: controller.signal });
        const body = await response.json().catch(() => ({})) as { materialId?: unknown };
        if (!controller.signal.aborted) setMaterialId(response.ok && typeof body.materialId === "number" ? body.materialId : null);
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMaterialId(null); }
    })();
    return () => controller.abort();
  }, [accessToken, slug]);
  async function download() {
    if (!accessToken || materialId === null) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/aluno/estudar/lei/${encodeURIComponent(slug)}/materiais/${materialId}/download`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      if (!response.ok) throw new Error("PDF indisponível");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[\\/:*?"<>|]/g, "-") || "Legislacao-esquematizada"}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setDownloading(false); }
  }
  if (materialId === null) return null;
  return <button type="button" className={styles.mapPdfDownload} disabled={downloading} onClick={() => void download()}>📄 {downloading ? "Baixando PDF…" : "Baixar PDF esquematizado"}</button>;
}

function structureTree(structures: StructureCatalogItem[], references: Reference[]): TocNode[] {
  const roots: TocNode[] = [];
  const byId = new Map<number, TocNode>();
  // The `ordem` is only unique among siblings. Creating the whole registry
  // before attaching nodes prevents a "Seção 01" from appearing at the root
  // simply because its parent "Capítulo 02" has a later global order.
  for (const structure of structures) {
    const item: TocNode = { key: `structure:${structure.id}`, structure, reference: null, children: [], referenceIds: [] };
    byId.set(structure.id, item);
  }
  for (const item of byId.values()) {
    const parent = item.structure.parentId === null ? null : byId.get(item.structure.parentId);
    (parent?.children ?? roots).push(item);
  }
  const sortTree = (nodes: TocNode[]) => {
    nodes.sort((left, right) => left.structure.order - right.structure.order || left.structure.id - right.structure.id);
    nodes.forEach((node) => sortTree(node.children));
  };
  sortTree(roots);
  for (const reference of references) for (const hierarchy of reference.hierarchy) {
    const item = byId.get(hierarchy.id);
    if (!item) continue;
    item.referenceIds.push(reference.id);
    if (!item.reference) item.reference = reference;
  }
  return roots;
}

function StructureItems({ nodes, activeId, onNavigate, collapsed, onToggle, audioCoverageByStructureId }: { nodes: TocNode[]; activeId: string | null; onNavigate: (reference: Reference) => void; collapsed: Set<string>; onToggle: (key: string) => void; audioCoverageByStructureId: ReadonlyMap<number, StructureAudioCoverage> }) {
  return <ol>{nodes.map((node) => {
    const active = Boolean(activeId && node.referenceIds.includes(activeId));
    const enabled = node.structure.status === "accessible" && node.reference;
    const audioCoverage = audioCoverageByStructureId.get(node.structure.id) ?? null;
    return <li key={node.key} className={styles.tocSection}>
      <div className={styles.tocLine}>{node.children.length ? <button type="button" aria-label={collapsed.has(node.key) ? `Expandir ${node.structure.name}` : `Recolher ${node.structure.name}`} aria-expanded={!collapsed.has(node.key)} onClick={() => onToggle(node.key)}>{collapsed.has(node.key) ? "+" : "−"}</button> : <span className={styles.tocToggleSpacer} aria-hidden="true" />}{enabled ? <a className={active ? styles.tocActive : undefined} aria-current={active ? "location" : undefined} href={`#${continuousBlockAnchor(node.reference!.id)}`} onClick={() => onNavigate(node.reference!)}><span>{node.structure.name}</span>{audioCoverage ? <small className={`${styles.tocAudioBadge} ${audioCoverage.kind === "direct" ? styles.tocAudioDirect : styles.tocAudioCovered}`} title={audioCoverage.kind === "direct" ? "Esta estrutura possui faixa própria do LegisCast" : `Esta estrutura é abrangida pelo áudio de ${audioCoverage.sourceName}`}>{audioCoverage.kind === "direct" ? "🎧 Áudio" : "↳ Áudio"}</small> : null}</a> : <span className={node.structure.status === "blocked" ? styles.tocBlocked : styles.tocPending}>{node.structure.name}<small>{node.structure.status === "blocked" ? "Bloqueada" : "Pendente"}</small></span>}</div>
      {node.children.length && !collapsed.has(node.key) ? <StructureItems nodes={node.children} activeId={activeId} onNavigate={onNavigate} collapsed={collapsed} onToggle={onToggle} audioCoverageByStructureId={audioCoverageByStructureId} /> : null}
    </li>;
  })}</ol>;
}

function TableOfContents({ structures, references, studyUnits, lawTitle, rootHref, activeId, onNavigate, pauseContinuationReference = null, onContinueFromPause, collapsed, onToggle }: { structures: StructureCatalogItem[]; references: Reference[]; studyUnits: StudyUnit[]; lawTitle: string; rootHref: string; activeId: string | null; onNavigate: (reference: Reference) => void; pauseContinuationReference?: Reference | null; onContinueFromPause?: (reference: Reference) => void; collapsed: Set<string>; onToggle: (key: string) => void }) {
  const nodes = structureTree(structures, references);
  const audioCoverageByStructureId = new Map<number, StructureAudioCoverage>();
  const structureNames = new Map(structures.map((structure) => [structure.id, structure.name]));
  for (const unit of studyUnits) {
    if (unit.kind !== "audio") continue;
    const sourceName = structureNames.get(unit.titleStructureId) ?? "outra estrutura";
    for (const structureId of unit.structureIds) audioCoverageByStructureId.set(structureId, { kind: structureId === unit.titleStructureId ? "direct" : "covered", sourceName });
  }
  return <div className={styles.tocLawRoot}>
    <a href={rootHref} className={styles.tocLawRootLink} title="Voltar ao início da lei">{lawTitle}</a>
    {audioCoverageByStructureId.size ? <p className={styles.tocAudioLegend}><span>🎧 faixa própria</span><span>↳ estrutura abrangida</span></p> : null}
    {pauseContinuationReference && onContinueFromPause ? <button type="button" className={styles.tocContinue} onClick={() => onContinueFromPause(pauseContinuationReference)}>Continuar de onde parei</button> : null}
    {nodes.length ? <StructureItems nodes={nodes} activeId={activeId} onNavigate={onNavigate} collapsed={collapsed} onToggle={onToggle} audioCoverageByStructureId={audioCoverageByStructureId} /> : <p>Sem subdivisões estruturais cadastradas.</p>}
  </div>;
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

function mapArticleLabel(identification: string, lawShortName: string) {
  const suffix = `, ${lawShortName}`;
  return lawShortName && identification.endsWith(suffix)
    ? identification.slice(0, -suffix.length)
    : identification;
}

function InteractiveLawMap({ references, lawShortName, onOpen }: { references: Reference[]; lawShortName: string; onOpen: (reference: Reference) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Priority | "todas">("todas");
  const normalizedQuery = normalizeSearch(query);
  const ordered = useMemo(() => [...references]
    .filter((reference) => !reference.inactive)
    .filter((reference) => reference.linkedQuestions > 0 || reference.priority !== "nao_mapeado" || reference.recent)
    .filter((reference) => filter === "todas" || reference.priority === filter)
    .filter((reference) => !normalizedQuery || normalizeSearch(`${reference.identificacao} ${reference.ordem} ${reference.hierarchy.map((node) => node.name).join(" ")}`).includes(normalizedQuery))
    .sort((first, second) => first.ordem.localeCompare(second.ordem, "pt-BR", { numeric: true })), [filter, normalizedQuery, references]);

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
    <div className={styles.priorityLegend} aria-label="Legenda do mapa"><span className={styles.priorityGradient} aria-hidden="true" /><span>Prioridade de revisão</span><span className={styles.recentLegend}><i aria-hidden="true">⚑</i>Conteúdo recente</span></div>
    {ordered.length ? <ol className={styles.mapGrid} aria-live="polite">{ordered.map((reference) => <li key={reference.id}>
      <a href={`#${continuousBlockAnchor(reference.id)}`} className={`${styles.mapArticle} ${styles[`incidence_${incidenceBand(reference.linkedQuestions)}`]} ${reference.recent ? styles.mapArticleRecent : ""}`} title={`${PRIORITY_LABELS[reference.priority]}${reference.recent ? " · Conteúdo recente" : ""}`} onClick={(event) => { event.preventDefault(); onOpen(reference); }}>
        {reference.recent ? <span className={styles.cardRecentFlag} role="img" aria-label="Conteúdo recente" title="Conteúdo recente">⚑</span> : null}
        <strong>{mapArticleLabel(reference.identificacao, lawShortName)}</strong>
        <small>{lawShortName}</small>
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

  // O efeito acima é a única fonte que escreve o HTML do bloco. Se este JSX
  // também usasse `dangerouslySetInnerHTML`, uma atualização do player (tempo,
  // velocidade etc.) reescreveria o HTML original e apagaria os <mark>s que já
  // foram inseridos para os destaques pessoais.
  return <div ref={containerRef} className={styles.legalHtml} />;
}

export default function ContinuousReadingClient({ slug, title, lawTitle = title, references, structures = [], studyUnits = [], partialMode = false, initialStructureId = null, initialStudyUnitId = null, initialBlocks, initialTab, recorteId = null, adminPreview = false, administrativeAccess = false, scopedReading = false, audioEndpoint, initialAudio = null, initialAudioStatus = "loading" }: { slug: string; title: string; lawTitle?: string; references: Reference[]; structures?: StructureCatalogItem[]; studyUnits?: StudyUnit[]; partialMode?: boolean; initialStructureId?: number | null; initialStudyUnitId?: string | null; initialBlocks: Block[]; initialTab: "legisbot" | "community" | "highlights"; recorteId?: string | null; adminPreview?: boolean; administrativeAccess?: boolean; scopedReading?: boolean; audioEndpoint?: string; initialAudio?: LegiscastAudioTrack | null; initialAudioStatus?: AudioStatus }) {
  const tocStudyUnits = adminPreview ? studyUnits : [];
  const prepared = useMemo(() => references.filter((reference) => reference.prepared), [references]);
  const preparedById = useMemo(() => new Map(prepared.map((reference) => [reference.id, reference])), [prepared]);
  const readingAdvances = useMemo(() => continuousReadingAdvances(prepared), [prepared]);
  const [studyMode, setStudyMode] = useState<"mapa" | "leitura">("leitura");
  const [blocks, setBlocks] = useState(() => new Map(initialBlocks.map((block) => [block.id, block])));
  const [blockHighlights, setBlockHighlights] = useState<Map<string, LegisBotHighlight[]>>(() => new Map());
  // A sessão é restaurada de forma assíncrona no cliente. Guardar o token em
  // estado faz a leitura tentar novamente quando o aluno já está autenticado,
  // em vez de perder a única tentativa feita antes da restauração.
  const [highlightAccessToken, setHighlightAccessToken] = useState<string | null | undefined>(undefined);
  const [studentId, setStudentId] = useState<string | null | undefined>(undefined);
  const [markerReferenceId, setMarkerReferenceId] = useState<string | null>(null);
  const [loadingPages, setLoadingPages] = useState<Set<number>>(() => new Set());
  const initialLoadedPages = useCallback(() => {
    if (!initialBlocks.length) return new Set<number>();
    if (adminPreview && initialBlocks.length >= prepared.length) return new Set(Array.from({ length: Math.ceil(prepared.length / PAGE_SIZE) }, (_, index) => index));
    return new Set([0]);
  }, [adminPreview, initialBlocks.length, prepared.length]);
  const [loadedPages, setLoadedPages] = useState<Set<number>>(initialLoadedPages);
  const [failedPages, setFailedPages] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<Block | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [desktopTocOpen, setDesktopTocOpen] = useState(true);
  const [tocWidth, setTocWidth] = useState(TOC_DEFAULT_WIDTH);
  const [isResizingToc, setIsResizingToc] = useState(false);
  const [isTocExpanded, setIsTocExpanded] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [collapsedStructures, setCollapsedStructures] = useState<Set<string>>(() => new Set());
  const [missingTarget, setMissingTarget] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState<number | null>(initialStructureId);
  const [selectedStudyUnitId, setSelectedStudyUnitId] = useState<string | null>(initialStudyUnitId);
  const [suggestedAudio, setSuggestedAudio] = useState<LegiscastAudioTrack | null>(initialAudio);
  const [suggestedAudioStatus, setSuggestedAudioStatus] = useState<AudioStatus>(initialAudioStatus);
  const [playingAudio, setPlayingAudio] = useState<LegiscastAudioTrack | null>(null);
  const [playerCondensed, setPlayerCondensed] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const playerHeaderRef = useRef<HTMLElement | null>(null);
  const requestedPagesRef = useRef(new Set<number>());
  const loadedHighlightReferencesRef = useRef(new Set<string>());
  const scrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const ignoreHashRef = useRef(false);
  const scopeVersionRef = useRef(0);
  const scopeInitializedRef = useRef(false);
  const audioRequestRef = useRef(0);
  // undefined = navegação normal; null também é um destino válido (raiz da lei).
  const preserveAudioOnNextNavigationRef = useRef<number | null | undefined>(undefined);
  const resumeAttemptedRef = useRef(false);
  const tocResizeStartRef = useRef<{ pointerX: number; width: number } | null>(null);
  const audioByStructureRef = useRef(new Map<string, { at: number; audio: LegiscastAudioTrack | null; status: Exclude<AudioStatus, "loading"> }>(initialAudio && initialAudioStatus !== "loading" ? [[initialStructureId === null ? "law" : String(initialStructureId), { at: Date.now(), audio: initialAudio, status: initialAudioStatus }]] : []));
  const toggleStructure = useCallback((key: string) => setCollapsedStructures((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; }), []);
  const clampTocWidth = useCallback((width: number) => {
    const viewportLimit = typeof window === "undefined" ? TOC_MAX_WIDTH : Math.max(TOC_MIN_WIDTH, Math.min(TOC_MAX_WIDTH, Math.floor(window.innerWidth * 0.48)));
    return Math.max(TOC_MIN_WIDTH, Math.min(viewportLimit, Math.round(width)));
  }, []);
  const updateTocWidth = useCallback((width: number, persist = false) => {
    const nextWidth = clampTocWidth(width);
    setTocWidth(nextWidth);
    if (persist) {
      try { window.localStorage.setItem(TOC_WIDTH_STORAGE_KEY, String(nextWidth)); } catch { /* sem persistência */ }
    }
  }, [clampTocWidth]);
  const beginTocResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    tocResizeStartRef.current = { pointerX: event.clientX, width: tocWidth };
    setIsResizingToc(true);
  }, [tocWidth]);
  const handleTocResizeKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); updateTocWidth(tocWidth - 16, true); }
    if (event.key === "ArrowRight") { event.preventDefault(); updateTocWidth(tocWidth + 16, true); }
    if (event.key === "Home") { event.preventDefault(); updateTocWidth(TOC_MIN_WIDTH, true); }
    if (event.key === "End") { event.preventDefault(); updateTocWidth(TOC_MAX_WIDTH, true); }
  }, [tocWidth, updateTocWidth]);
  useEffect(() => {
    try {
      const savedWidth = Number(window.localStorage.getItem(TOC_WIDTH_STORAGE_KEY));
      if (Number.isFinite(savedWidth)) setTocWidth(clampTocWidth(savedWidth));
    } catch { /* A leitura continua utilizável se o navegador bloquear armazenamento. */ }
  }, [clampTocWidth]);
  useEffect(() => {
    if (!isResizingToc) return;
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const start = tocResizeStartRef.current;
      if (start) updateTocWidth(start.width + event.clientX - start.pointerX);
    };
    const finishResize = () => {
      const start = tocResizeStartRef.current;
      tocResizeStartRef.current = null;
      setIsResizingToc(false);
      if (start) {
        setTocWidth((current) => {
          const nextWidth = clampTocWidth(current);
          try { window.localStorage.setItem(TOC_WIDTH_STORAGE_KEY, String(nextWidth)); } catch { /* sem persistência */ }
          return nextWidth;
        });
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", finishResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
    };
  }, [clampTocWidth, isResizingToc, updateTocWidth]);
  useEffect(() => {
    if (!isTocExpanded) return;
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setIsTocExpanded(false);
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [isTocExpanded]);
  const studyUnitByStructureId = useMemo(() => new Map(studyUnits.flatMap((unit) => unit.structureIds.map((structureId) => [structureId, unit] as const))), [studyUnits]);
  const preparedIndexById = useMemo(() => new Map(prepared.map((reference, index) => [reference.id, index])), [prepared]);
  const pauseContinuationReference = useMemo(() => resolveContinuousReadingPauseTarget({ references: prepared, pausedAfterReferenceId: markerReferenceId }), [markerReferenceId, prepared]);
  const selectedStudyUnit = useMemo(() => selectedStudyUnitId === null ? null : studyUnits.find((unit) => unit.id === selectedStudyUnitId) ?? null, [selectedStudyUnitId, studyUnits]);
  const visiblePrepared = useMemo(() => {
    if (selectedStudyUnit) {
      const structureIds = new Set(selectedStudyUnit.structureIds);
      return prepared.filter((reference) => structureIds.has(reference.hierarchy.at(-1)?.id ?? -1));
    }
    return (!partialMode && !scopedReading) || selectedStructureId === null ? prepared : prepared.filter((reference) => reference.hierarchy.some((node) => node.id === selectedStructureId));
  }, [partialMode, prepared, scopedReading, selectedStructureId, selectedStudyUnit]);

  useEffect(() => {
    if (!partialMode && !scopedReading && selectedStudyUnitId === null) return;
    if (!scopeInitializedRef.current) {
      scopeInitializedRef.current = true;
      return;
    }
    scopeVersionRef.current += 1;
    requestedPagesRef.current.clear();
    setLoadedPages(new Set());
    setFailedPages(new Set());
  }, [partialMode, scopedReading, selectedStructureId, selectedStudyUnitId]);

  const loadPage = useCallback(async (page: number) => {
    // A leitura pública aguarda o token; a prévia administrativa é autorizada
    // pelo cookie de administrador no servidor.
    if (!administrativeAccess && highlightAccessToken === undefined) return;
    if (!canLoadContinuousPage({ page, preparedCount: visiblePrepared.length, pageSize: PAGE_SIZE, loadedPages, loadingPages })) return;
    if (requestedPagesRef.current.has(page)) return;
    const offset = page * PAGE_SIZE;
    if (offset >= visiblePrepared.length) return;
    const referenceIds = visiblePrepared.slice(offset, offset + PAGE_SIZE).map((reference) => reference.id);
    if (!referenceIds.length) return;
    requestedPagesRef.current.add(page);
    const scopeVersion = scopeVersionRef.current;
    setFailedPages((current) => { const next = new Set(current); next.delete(page); return next; });
    setLoadingPages((current) => new Set(current).add(page));
    try {
      // No modo global, o servidor já autoriza qualquer bloco preparado desta
      // lei. Enviar a unidade a cada página obrigaria a reconstruir todo o
      // catálogo no endpoint, sem acrescentar proteção. No modo parcial a
      // unidade continua sendo validada no servidor antes de entregar HTML.
      const scope = partialMode && selectedStudyUnitId !== null
        ? `&study_unit_id=${encodeURIComponent(selectedStudyUnitId)}`
        : partialMode && selectedStructureId !== null ? `&structure_id=${encodeURIComponent(String(selectedStructureId))}` : "";
      const response = await fetch(`/api/legisbot/${encodeURIComponent(slug)}/references?reference_ids=${encodeURIComponent(referenceIds.join(","))}${scope}`, { cache: "no-store", headers: administrativeAccess || !highlightAccessToken ? undefined : { Authorization: `Bearer ${highlightAccessToken}` } });
      const result = await response.json() as { blocks?: BlockText[] };
      if (!response.ok || !result.blocks) throw new Error("load_failed");
      if (scopeVersion !== scopeVersionRef.current) return;
      setBlocks((current) => {
        const next = new Map(current);
        for (const block of result.blocks ?? []) {
          const reference = preparedById.get(block.id);
          if (reference) next.set(block.id, { ...reference, legislation: block.legislation });
        }
        return next;
      });
      setLoadedPages((current) => completedContinuousPage(current, page));
    } catch {
      setFailedPages((current) => new Set(current).add(page));
    } finally {
      requestedPagesRef.current.delete(page);
      setLoadingPages((current) => { const next = new Set(current); next.delete(page); return next; });
    }
  }, [administrativeAccess, highlightAccessToken, loadedPages, loadingPages, partialMode, preparedById, selectedStructureId, selectedStudyUnitId, slug, visiblePrepared]);

  useEffect(() => {
    if ((!partialMode && selectedStudyUnitId === null) || !visiblePrepared.length || loadedPages.has(0)) return;
    void loadPage(0);
  }, [loadPage, loadedPages, partialMode, selectedStudyUnitId, visiblePrepared.length]);

  useEffect(() => {
    setLoadedPages(initialLoadedPages());
  }, [initialBlocks, initialLoadedPages]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setHighlightAccessToken(data.session?.access_token ?? null);
        setStudentId(data.session?.user.id ?? null);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setHighlightAccessToken(session?.access_token ?? null);
        setStudentId(session?.user.id ?? null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (adminPreview || !studentId) { setMarkerReferenceId(null); return; }
    try {
      const key = continuousReadingMarkerStorageKey({ accountId: studentId, lawSlug: slug, recorteId });
      setMarkerReferenceId(readContinuousReadingMarker(window.localStorage, key));
    } catch { setMarkerReferenceId(null); }
  }, [adminPreview, recorteId, slug, studentId]);

  useEffect(() => {
    loadedHighlightReferencesRef.current.clear();
    setBlockHighlights(new Map());
  }, [highlightAccessToken]);

  useEffect(() => {
    const referenceIds = [...blocks.keys()].filter((id) => !loadedHighlightReferencesRef.current.has(id)).slice(0, PAGE_SIZE);
    if (!referenceIds.length || adminPreview || !highlightAccessToken) return;
    let active = true;
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(`/api/legisbot/${encodeURIComponent(slug)}/destaques?reference_ids=${encodeURIComponent(referenceIds.join(","))}`, { cache: "no-store", headers: { Authorization: `Bearer ${highlightAccessToken}` }, signal: controller.signal });
      const result = await response.json().catch(() => null) as { success?: boolean; highlights?: Array<LegisBotHighlight & { referenceId: string }> } | null;
      if (!active || !response.ok || !result?.success) return;
      for (const id of referenceIds) loadedHighlightReferencesRef.current.add(id);
      setBlockHighlights((current) => {
        const next = new Map(current);
        for (const id of referenceIds) next.set(id, (result.highlights ?? []).filter((highlight) => highlight.referenceId === id));
        return next;
      });
    })();
    return () => { active = false; controller.abort(); };
  }, [adminPreview, blocks, highlightAccessToken, slug]);

  const navigate = useCallback((reference: Reference) => {
    const structureId = reference.hierarchy.at(-1)?.id ?? null;
    if (partialMode && structureId !== null) setSelectedStructureId(structureId);
    const unit = structureId === null ? null : studyUnitByStructureId.get(structureId) ?? null;
    if (unit) setSelectedStudyUnitId(unit.id);
    const index = visiblePrepared.findIndex((item) => item.id === reference.id);
    if (index >= 0 && !blocks.has(reference.id)) void loadPage(Math.floor(index / PAGE_SIZE));
    scrollBehaviorRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    setFocusedId(reference.id);
    setActiveId(reference.id);
    setMobileTocOpen(false);
  }, [blocks, loadPage, partialMode, studyUnitByStructureId, visiblePrepared]);

  const openFromMap = useCallback((reference: Reference) => {
    ignoreHashRef.current = false;
    window.history.replaceState(window.history.state, "", `#${continuousBlockAnchor(reference.id)}`);
    setMissingTarget(false);
    setStudyMode("leitura");
    navigate(reference);
  }, [navigate]);

  const navigatePreservingAudio = useCallback((reference: Reference) => {
    preserveAudioOnNextNavigationRef.current = reference.hierarchy.at(-1)?.id ?? null;
    navigate(reference);
  }, [navigate]);

  const advanceTo = useCallback((referenceId: string) => {
    const reference = preparedById.get(referenceId);
    if (!reference) return;
    // A mudança de trecho só movimenta a leitura. Não toca no estado do
    // player: uma faixa em execução continua sob controle explícito do aluno.
    window.history.replaceState(window.history.state, "", `#${continuousBlockAnchor(reference.id)}`);
    setMissingTarget(false);
    navigatePreservingAudio(reference);
  }, [navigatePreservingAudio, preparedById]);

  const continueFromPause = useCallback((reference: Reference) => {
    advanceTo(reference.id);
  }, [advanceTo]);

  const toggleMarker = useCallback((reference: Reference) => {
    if (!studentId) return;
    const nextMarkerId = markerReferenceId === reference.id ? null : reference.id;
    try {
      const key = continuousReadingMarkerStorageKey({ accountId: studentId, lawSlug: slug, recorteId });
      saveContinuousReadingMarker(window.localStorage, key, nextMarkerId);
      setMarkerReferenceId(nextMarkerId);
    } catch { /* O artigo continua legível se o navegador bloquear armazenamento. */ }
  }, [markerReferenceId, recorteId, slug, studentId]);

  const showMap = useCallback(() => {
    ignoreHashRef.current = true;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    setMissingTarget(false);
    setStudyMode("mapa");
  }, []);

  useEffect(() => {
    resumeAttemptedRef.current = false;
  }, [recorteId, slug, studentId]);

  useEffect(() => {
    if (adminPreview || studentId === undefined || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    // A URL (inclusive um UUID inválido) é uma decisão explícita do aluno e
    // não pode ser trocada silenciosamente pela retomada local.
    if (window.location.hash) return;
    const storageKey = studentId
      ? continuousReadingResumeStorageKey({ accountId: studentId, lawSlug: slug, recorteId })
      : null;
    let savedReferenceId: string | null = null;
    let pausedAfterReferenceId: string | null = null;
    if (studentId && storageKey) {
      try {
        savedReferenceId = window.localStorage.getItem(storageKey);
        pausedAfterReferenceId = readContinuousReadingMarker(window.localStorage, continuousReadingMarkerStorageKey({ accountId: studentId, lawSlug: slug, recorteId }));
      } catch { /* sem retomada persistida */ }
    }
    const target = resolveContinuousReadingResume({ references: prepared, savedReferenceId, pausedAfterReferenceId, hasExplicitDestination: false });
    if (!target) return;
    const structureId = target.hierarchy.at(-1)?.id ?? null;
    if (partialMode && structureId !== null) setSelectedStructureId(structureId);
    const unit = structureId === null ? null : studyUnitByStructureId.get(structureId) ?? null;
    if (unit) setSelectedStudyUnitId(unit.id);
    preserveAudioOnNextNavigationRef.current = structureId;
    scrollBehaviorRef.current = "auto";
    setMissingTarget(false);
    setFocusedId(target.id);
    setActiveId(target.id);
  }, [adminPreview, partialMode, prepared, recorteId, slug, studentId, studyUnitByStructureId]);

  useEffect(() => {
    if (adminPreview || !studentId || !activeId || !preparedById.has(activeId)) return;
    try {
      const storageKey = continuousReadingResumeStorageKey({ accountId: studentId, lawSlug: slug, recorteId });
      window.localStorage.setItem(storageKey, activeId);
    } catch { /* sem persistência local */ }
  }, [activeId, adminPreview, preparedById, recorteId, slug, studentId]);

  useEffect(() => {
    if (ignoreHashRef.current) return;
    const referenceId = referenceIdFromHash(window.location.hash);
    if (!referenceId) return;
    if (!adminPreview) setStudyMode("leitura");
    const index = prepared.findIndex((item) => item.id === referenceId);
    if (index < 0) { setMissingTarget(true); return; }
    const reference = prepared[index];
    const structureId = reference.hierarchy.at(-1)?.id ?? null;
    const unit = structureId === null ? null : studyUnitByStructureId.get(structureId) ?? null;
    if (unit) setSelectedStudyUnitId(unit.id);
    setMissingTarget(false);
    scrollBehaviorRef.current = "auto";
    setFocusedId(referenceId);
    setActiveId(referenceId);
    if (!blocks.has(referenceId)) void loadPage(Math.floor(index / PAGE_SIZE));
  }, [adminPreview, blocks, loadPage, prepared, studyUnitByStructureId]);

  useEffect(() => {
    if (!focusedId) return;
    const index = visiblePrepared.findIndex((item) => item.id === focusedId);
    if (index >= 0 && !blocks.has(focusedId)) void loadPage(Math.floor(index / PAGE_SIZE));
  }, [blocks, focusedId, loadPage, visiblePrepared]);

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
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); window.setTimeout(() => returnFocusRef.current?.focus(), 0); };
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

  const accessibleStructureIds = useMemo(() => new Set(structures.filter((structure) => structure.status === "accessible").map((structure) => structure.id)), [structures]);
  const structureTargets = useMemo(() => {
    const seen = new Set<number>();
    return prepared.filter((reference) => {
      const structureId = reference.hierarchy.at(-1)?.id;
      if (!structureId || !accessibleStructureIds.has(structureId) || seen.has(structureId)) return false;
      seen.add(structureId);
      return true;
    });
  }, [accessibleStructureIds, prepared]);
  const activeStructure = prepared.find((reference) => reference.id === activeId)?.hierarchy.at(-1) ?? null;
  const activeStudyUnit = activeStructure ? studyUnitByStructureId.get(activeStructure.id) ?? selectedStudyUnit : selectedStudyUnit;
  const studyUnitTargets = useMemo(() => studyUnits.flatMap((unit) => {
    const structureIds = new Set(unit.structureIds);
    const reference = prepared.find((candidate) => {
      const structureId = candidate.hierarchy.at(-1)?.id;
      return structureId !== undefined && structureIds.has(structureId) && accessibleStructureIds.has(structureId);
    });
    return reference ? [{ unit, reference }] : [];
  }), [accessibleStructureIds, prepared, studyUnits]);
  const navigationTargets = studyUnitTargets.length ? studyUnitTargets.map((target) => target.reference) : structureTargets;
  const hasStructureNavigation = structures.length > 0 && navigationTargets.length > 0;
  const visibleStructureId = activeStructure?.id ?? selectedStructureId;
  const unitTitle = activeStudyUnit ? structures.find((structure) => structure.id === activeStudyUnit.titleStructureId)?.name : null;
  const visibleStructureName = unitTitle ?? activeStructure?.name ?? navigationTargets[0]?.hierarchy.at(-1)?.name ?? lawTitle;

  useEffect(() => {
    if (adminPreview) return;
    const preservedStructureId = preserveAudioOnNextNavigationRef.current;
    if (preservedStructureId !== undefined) {
      // A troca interna de unidade pode renderizar uma vez antes de o artigo
      // de destino entrar em foco. Não consulte nem troque áudio nesse meio.
      if (preservedStructureId !== visibleStructureId) return;
      preserveAudioOnNextNavigationRef.current = undefined;
      // A faixa em reprodução é independente da sugestão: resolva o destino
      // sem trocar o player até o aluno escolher o novo áudio.
    }
    // A leitura pública precisa aguardar a restauração assíncrona da sessão.
    // Sem isso, a primeira tentativa acontece sem Bearer token, é marcada como
    // "sem áudio" e não é refeita quando o aluno já está autenticado.
    if (!audioEndpoint && highlightAccessToken === undefined) return;
    const requestId = ++audioRequestRef.current;
    const controller = new AbortController();
    const cacheKey = visibleStructureId === null ? "law" : String(visibleStructureId);
    const cached = audioByStructureRef.current.get(cacheKey);
    // URL assinada dura uma hora; o cache vive somente nesta aba e expira antes.
    if (cached && Date.now() - cached.at < 50 * 60 * 1000) {
      setSuggestedAudio(cached.audio);
      setSuggestedAudioStatus(cached.status);
      return () => controller.abort();
    }
    setSuggestedAudio(null);
    setSuggestedAudioStatus("loading");
    void (async () => {
      if (!audioEndpoint && !highlightAccessToken) { if (requestId === audioRequestRef.current) setSuggestedAudioStatus("unavailable"); return; }
      const query = visibleStructureId === null ? "" : `?structure_id=${encodeURIComponent(String(visibleStructureId))}`;
      try {
        const endpoint = audioEndpoint ?? `/api/legisbot/${encodeURIComponent(slug)}/legiscast`;
        const response = await fetch(`${endpoint}${query}`, { cache: "no-store", headers: audioEndpoint ? undefined : { Authorization: `Bearer ${highlightAccessToken}` }, signal: controller.signal });
        const body = await response.json().catch(() => ({})) as { audio?: LegiscastAudioTrack | null; status?: Exclude<AudioStatus, "loading"> };
        if (requestId !== audioRequestRef.current) return;
        const value = { at: Date.now(), audio: response.ok && body.audio ? body.audio : null, status: response.ok && body.status ? body.status : "unavailable" as const };
        audioByStructureRef.current.set(cacheKey, value);
        setSuggestedAudio(value.audio);
        setSuggestedAudioStatus(value.status);
      } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; if (requestId === audioRequestRef.current) setSuggestedAudioStatus("unavailable"); }
    })();
    return () => controller.abort();
  }, [adminPreview, audioEndpoint, highlightAccessToken, slug, visibleStructureId]);

  useEffect(() => {
    if (adminPreview) return;
    const updatePlayerDensity = () => {
      const top = playerHeaderRef.current?.getBoundingClientRect().top;
      setPlayerCondensed(typeof top === "number" && top <= 80);
    };
    updatePlayerDensity();
    window.addEventListener("scroll", updatePlayerDensity, { passive: true });
    return () => window.removeEventListener("scroll", updatePlayerDensity);
  }, [adminPreview]);

  return <div className={styles.page}>
    <main className={styles.shell}>
      <LegisBotGuide lawTitle={lawTitle} mode={studyMode} adminPreview={adminPreview} />
      {!adminPreview ? <div className={styles.mapSoon}>
        <button type="button" disabled title="O mapeamento por prioridade será disponibilizado em breve.">🔥 Mapear lei</button>
        <LegiscastPdfDownload slug={slug.toLowerCase()} title={lawTitle} accessToken={highlightAccessToken} />
      </div> : null}
      {!adminPreview && studyMode === "mapa" ? <InteractiveLawMap references={prepared} lawShortName={title} onOpen={openFromMap} /> : <>
        {adminPreview ? <aside className={styles.guidance} aria-label="Orientação de uso"><strong>Revise a legislação</strong><span>Toque em um bloco para abrir sua edição na Base Legislativa.</span></aside> : null}
        {missingTarget ? <p className={styles.targetNotice} role="status">Este dispositivo não está disponível nesta versão da legislação. Continue pelo sumário.</p> : null}
        {mobileTocOpen && hasStructureNavigation ? <div className={styles.mobileTocBackdrop} onClick={() => setMobileTocOpen(false)}><nav id="legisbot-mobile-toc" className={styles.mobileTocPanel} aria-label="Sumário da legislação" onClick={(event) => event.stopPropagation()}><header><div><h2>Sumário</h2><p>Escolha uma estrutura disponível.</p></div><button type="button" aria-label="Fechar sumário" autoFocus onClick={() => setMobileTocOpen(false)}>×</button></header><TableOfContents structures={structures} references={prepared} studyUnits={tocStudyUnits} lawTitle={lawTitle} rootHref={`/legisbot/${encodeURIComponent(slug.toLowerCase())}`} activeId={activeId} onNavigate={navigate} pauseContinuationReference={pauseContinuationReference} onContinueFromPause={(reference) => { continueFromPause(reference); setMobileTocOpen(false); }} collapsed={collapsedStructures} onToggle={toggleStructure} /></nav></div> : null}
        {isTocExpanded && hasStructureNavigation ? <div className={styles.expandedTocBackdrop} role="presentation" onClick={() => setIsTocExpanded(false)}><nav className={styles.expandedTocPanel} role="dialog" aria-modal="true" aria-label="Sumário ampliado" onClick={(event) => event.stopPropagation()}><header><div><p className={styles.eyebrow}>Navegação da lei</p><h2>Sumário</h2></div><button type="button" autoFocus onClick={() => setIsTocExpanded(false)}>Fechar <span aria-hidden="true">×</span></button></header><TableOfContents structures={structures} references={prepared} studyUnits={tocStudyUnits} lawTitle={lawTitle} rootHref={`/legisbot/${encodeURIComponent(slug.toLowerCase())}`} activeId={activeId} onNavigate={(reference) => { navigate(reference); setIsTocExpanded(false); }} pauseContinuationReference={pauseContinuationReference} onContinueFromPause={(reference) => { continueFromPause(reference); setIsTocExpanded(false); }} collapsed={collapsedStructures} onToggle={toggleStructure} /></nav></div> : null}
        <div className={`${styles.layout} ${hasStructureNavigation ? (desktopTocOpen ? "" : styles.layoutTocClosed) : styles.layoutNoToc} ${isResizingToc ? styles.layoutResizing : ""}`} style={{ "--toc-width": `${tocWidth}px` } as CSSProperties}>
        {hasStructureNavigation ? <aside className={`${styles.tocShell} ${desktopTocOpen ? "" : styles.tocShellClosed}`}><div className={styles.tocActions}><button type="button" className={styles.tocToggle} aria-expanded={desktopTocOpen} onClick={() => setDesktopTocOpen((open) => !open)}>{desktopTocOpen ? "← Recolher" : "☰"}<span className={styles.srOnly}> sumário</span></button>{!adminPreview ? <button type="button" className={styles.expandTocToggle} aria-expanded={isTocExpanded} title="Abrir sumário ampliado" onClick={() => setIsTocExpanded(true)}>⤢ Expandir</button> : null}</div>{desktopTocOpen ? <nav className={styles.toc} aria-label="Sumário da legislação"><h2>Sumário</h2><TableOfContents structures={structures} references={prepared} studyUnits={tocStudyUnits} lawTitle={lawTitle} rootHref={`/legisbot/${encodeURIComponent(slug.toLowerCase())}`} activeId={activeId} onNavigate={navigate} pauseContinuationReference={pauseContinuationReference} onContinueFromPause={continueFromPause} collapsed={collapsedStructures} onToggle={toggleStructure} /></nav> : null}</aside> : null}
        {hasStructureNavigation && desktopTocOpen ? <div className={styles.tocResize} role="separator" aria-orientation="vertical" aria-label="Ajustar largura do sumário" aria-valuemin={TOC_MIN_WIDTH} aria-valuemax={TOC_MAX_WIDTH} aria-valuenow={tocWidth} tabIndex={0} onPointerDown={beginTocResize} onKeyDown={handleTocResizeKeyDown} /> : null}
        <section ref={contentRef} className={styles.content} aria-label="Texto da legislação">
          {!adminPreview ? <header ref={playerHeaderRef} className={`${styles.stickyStructureHeader} ${playerCondensed ? styles.stickyStructureHeaderCompact : ""}`}>
            {hasStructureNavigation ? <div className={styles.headerMobileToc}>
              <button type="button" aria-expanded={mobileTocOpen} aria-controls="legisbot-mobile-toc" onClick={(event) => { returnFocusRef.current = event.currentTarget; setMobileTocOpen((open) => !open); }}>☰ <span>Sumário</span></button>
              <span aria-live="polite">{activeStructure?.name ?? "Início da lei"}</span>
            </div> : null}
            <div className={styles.structureAudio}>
              {playingAudio ?? suggestedAudio ? <>
                <div className={styles.audioHeading}>
                  <span className={styles.audioLabel}>LegisCast · {title}</span>
                  <strong>{visibleStructureName}</strong>
                  {playingAudio && suggestedAudio && playingAudio.id !== suggestedAudio.id ? <>
                    <em>Reproduzindo: {playingAudio.title}</em>
                    <button type="button" className={styles.audioSwitch} onClick={() => setPlayingAudio(suggestedAudio)}>Usar áudio desta unidade</button>
                  </> : null}
                </div>
                <LegiscastAudioTransport track={playingAudio ?? suggestedAudio!} compact hideTitle onStart={(track) => setPlayingAudio((current) => current ?? track)} />
              </> : suggestedAudioStatus === "loading" ? <small>Carregando áudio desta unidade…</small> : suggestedAudioStatus === "ambiguous" ? <small>Áudio requer revisão editorial</small> : null}
            </div>
            <span className={styles.srOnly} aria-live="polite">{playingAudio ? "Faixa em reprodução" : suggestedAudio ? "Faixa disponível" : "Sem faixa selecionada"}</span>
          </header> : null}
          {visiblePrepared.map((reference, index) => {
            const block = blocks.get(reference.id);
            const canOpenLegisBot = Boolean(block) && !reference.inactive;
            const page = Math.floor(index / PAGE_SIZE);
            const advance = readingAdvances.get(reference.id) ?? null;
            const preparedIndex = preparedIndexById.get(reference.id) ?? -1;
            const canMarkPause = preparedIndex >= 0 && preparedIndex < prepared.length - 1;
            const introducedHierarchy = hierarchyIntroducedBy(reference, visiblePrepared[index - 1]);
            return <Fragment key={reference.id}>
              <ReadingStructureHeadings nodes={introducedHierarchy} />
              <article
              id={continuousBlockAnchor(reference.id)}
              data-load-page={block ? undefined : page}
              className={`${styles.block} ${canOpenLegisBot ? styles.blockInteractive : ""} ${reference.inactive ? styles.blockInactive : ""} ${focusedId === reference.id || activeId === reference.id ? styles.blockFocused : ""}`}
              tabIndex={canOpenLegisBot ? 0 : undefined}
              aria-label={canOpenLegisBot ? `${reference.identificacao}. Abrir aprofundamento.` : undefined}
              onClick={canOpenLegisBot && block ? (event) => {
                if ((event.target as HTMLElement).closest("a")) return;
                openFromArticle(block, event.currentTarget);
              } : undefined}
              onKeyDown={canOpenLegisBot && block ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                activateBlock(block, event.currentTarget);
              } : undefined}
            >
              {block ? <ContinuousLegalHtml html={block.legislation} highlights={blockHighlights.get(reference.id) ?? []} /> : <div className={styles.placeholder} aria-busy={loadingPages.has(page)}><span className={styles.srOnly}>{failedPages.has(page) ? "Não foi possível carregar este bloco." : "Carregando texto legislativo"}</span><div className={styles.placeholderLine}/><div className={styles.placeholderLine}/>{failedPages.has(page) ? <button type="button" className={styles.retry} onClick={() => void loadPage(page)}>Tentar carregar novamente</button> : null}</div>}
              </article>
              {!adminPreview && studentId && block && canMarkPause ? <div className={styles.readingPause}><button type="button" className={markerReferenceId === reference.id ? styles.readingPauseActive : ""} aria-label={markerReferenceId === reference.id ? "Remover parei aqui" : "Marcar como parei aqui"} aria-pressed={markerReferenceId === reference.id} onClick={() => toggleMarker(reference)}>{markerReferenceId === reference.id ? "✓ Parei aqui" : "Parei aqui"}</button></div> : null}
              {!adminPreview && block && advance ? <section className={styles.advance} aria-label="Próximo trecho da lei"><small>Próximo trecho disponível</small><button type="button" onClick={() => advanceTo(advance.nextReferenceId)}><span>Avançar →</span><strong>{advance.nextName}</strong></button></section> : null}
            </Fragment>;
          })}
        </section>
        </div>
      </>}
    </main>
    {selected && !adminPreview ? <LegisBotOverlay slug={slug} question={{ referenceId: selected.id, ordem: selected.ordem, titulo: title, assunto: selected.identificacao, legislacao: selected.legislation }} initialTab={initialTab} onHighlightsChange={updateBlockHighlights} onClose={closeOverlay} /> : null}
  </div>;
}
