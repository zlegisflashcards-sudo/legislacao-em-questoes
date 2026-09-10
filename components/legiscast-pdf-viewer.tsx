"use client";

import { useEffect, useRef, useState } from "react";
import { legiscastPdfPositionKey, normalizeLegiscastPdfPage } from "@/lib/legiscast-pdf-position";
import { authorizedLegiscastPdfPath, LegiscastPdfError, pdfFailureForHttpStatus, validateLegiscastPdfBytes } from "@/lib/legiscast-pdf";
import { supabase } from "@/lib/supabase";

type OutlineItem = { title: string; dest: unknown; items?: OutlineItem[] };
type PdfViewport = { width: number; height: number; scale?: number };
type PdfPage = { getViewport: (input: { scale: number }) => PdfViewport; getTextContent: () => Promise<unknown>; render: (input: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> } };
type PdfDocument = { numPages: number; getPage: (page: number) => Promise<PdfPage>; getOutline: () => Promise<OutlineItem[] | null>; getDestination: (dest: string) => Promise<unknown>; getPageIndex: (ref: unknown) => Promise<number> };
type PdfJs = { GlobalWorkerOptions: { workerSrc: string }; getDocument: (source: string) => { promise: Promise<PdfDocument> }; TextLayer: new (input: { textContentSource: unknown; container: HTMLElement; viewport: PdfViewport }) => { render: () => Promise<void> } };

function storageKey(slug: string, recorteId: string | null) { return legiscastPdfPositionKey(slug, recorteId); }
function savedPage(slug: string, recorteId: string | null) { try { const page = Number(window.localStorage.getItem(storageKey(slug, recorteId))); return Number.isSafeInteger(page) && page > 0 ? page : 1; } catch { return 1; } }

async function fetchAuthorizedLegiscastPdf(slug: string, materialId: number, recorteId: string | null) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new LegiscastPdfError("unauthorized", "Sessão expirada.");
  const response = await fetch(authorizedLegiscastPdfPath(slug, materialId, recorteId), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");
  if (!response.ok) {
    console.warn("legiscast_pdf_response", { slug, materialId, hasRecorteId: Boolean(recorteId), status: response.status, contentType, contentLength });
    throw new LegiscastPdfError(pdfFailureForHttpStatus(response.status), "Não foi possível obter o PDF autorizado.", { status: response.status, contentType, contentLength });
  }
  const bytes = await response.arrayBuffer();
  console.info("legiscast_pdf_response", { slug, materialId, hasRecorteId: Boolean(recorteId), status: response.status, contentType, contentLength, size: bytes.byteLength });
  validateLegiscastPdfBytes(contentType, bytes);
  return new Blob([bytes], { type: "application/pdf" });
}

async function downloadAuthorizedPdf(slug: string, materialId: number, recorteId: string | null, title: string) {
  const blob = await fetchAuthorizedLegiscastPdf(slug, materialId, recorteId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function printAuthorizedPdf(slug: string, materialId: number, recorteId: string | null) {
  const blob = await fetchAuthorizedLegiscastPdf(slug, materialId, recorteId);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.className = "fixed h-px w-px opacity-0";
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.append(frame);
}

export function LegiscastPdfActions({ slug, materialId, recorteId, title, onExpand }: { slug: string; materialId: number; recorteId: string | null; title: string; onExpand: () => void }) {
  return <div className="grid grid-cols-3 gap-2" aria-label="Ações do PDF"><button type="button" onClick={() => void downloadAuthorizedPdf(slug, materialId, recorteId, title)} className="min-h-12 min-w-0 rounded-xl border border-blue-200 bg-white px-2 py-2 text-xs font-black text-blue-800">Baixar PDF</button><button type="button" onClick={() => void printAuthorizedPdf(slug, materialId, recorteId)} className="min-h-12 min-w-0 rounded-xl border border-blue-200 bg-white px-2 py-2 text-xs font-black text-blue-800">Imprimir</button><button type="button" onClick={onExpand} className="min-h-12 min-w-0 rounded-xl border border-blue-200 bg-blue-50 px-2 py-2 text-xs font-black text-blue-800">Expandir PDF</button></div>;
}

export function LegiscastPdfViewer({ slug, materialId, recorteId, title, onReady, onError }: { slug: string; materialId: number; recorteId: string | null; title: string; onReady?: () => void; onError?: () => void }) {
  const viewportRef = useRef<HTMLDivElement>(null); const pagesRef = useRef<HTMLDivElement>(null); const documentRef = useRef<PdfDocument | null>(null); const objectUrlRef = useRef(""); const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const [zoom, setZoom] = useState(1); const [outline, setOutline] = useState<OutlineItem[]>([]); const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => { let active = true; let objectUrl = ""; const render = async () => {
    setStatus("loading"); setOutline([]); setTotal(0); documentRef.current = null;
    try {
      objectUrl = URL.createObjectURL(await fetchAuthorizedLegiscastPdf(slug, materialId, recorteId)); objectUrlRef.current = objectUrl; const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as PdfJs; pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString(); let pdf: PdfDocument; try { pdf = await pdfjs.getDocument(objectUrl).promise; } catch (error) { throw new LegiscastPdfError("pdfjs_load_failed", "O PDF não pôde ser aberto.", { message: error instanceof Error ? error.message : "unknown" }); }
      if (!active) return; documentRef.current = pdf; setTotal(pdf.numPages); setOutline((await pdf.getOutline()) ?? []);
      const holder = pagesRef.current; const viewport = viewportRef.current; if (!holder || !viewport) throw new Error("Visor não disponível."); holder.replaceChildren();
      const desiredWidth = Math.max(280, viewport.clientWidth - 24);
      for (let number = 1; number <= pdf.numPages; number += 1) {
        const source = await pdf.getPage(number); const base = source.getViewport({ scale: 1 }); const scale = desiredWidth / base.width * zoom; const pageViewport = source.getViewport({ scale });
        const canvas = document.createElement("canvas"); const ratio = window.devicePixelRatio || 1; canvas.width = Math.floor(pageViewport.width * ratio); canvas.height = Math.floor(pageViewport.height * ratio); canvas.style.width = `${Math.floor(pageViewport.width)}px`; canvas.style.height = `${Math.floor(pageViewport.height)}px`; canvas.dataset.page = String(number);
        const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas indisponível."); context.scale(ratio, ratio);
        const pageWrapper = document.createElement("div"); pageWrapper.className = "relative mx-auto bg-white"; pageWrapper.style.width = canvas.style.width; pageWrapper.style.height = canvas.style.height; pageWrapper.append(canvas);
        const textLayer = document.createElement("div"); textLayer.className = "textLayer absolute inset-0 overflow-hidden text-transparent [line-height:1] selection:bg-blue-300/60"; textLayer.style.width = canvas.style.width; textLayer.style.height = canvas.style.height; pageWrapper.append(textLayer);
        const wrapper = document.createElement("div"); wrapper.className = "bg-slate-100 p-2 sm:p-3"; wrapper.append(pageWrapper); holder.append(wrapper);
        await source.render({ canvasContext: context, viewport: pageViewport }).promise;
        try { const textContent = await source.getTextContent(); await new pdfjs.TextLayer({ textContentSource: textContent, container: textLayer, viewport: pageViewport }).render(); } catch { textLayer.remove(); }
      }
      if (!active) return; const restored = normalizeLegiscastPdfPage(savedPage(slug, recorteId), pdf.numPages); setPage(restored); requestAnimationFrame(() => holder.querySelector<HTMLElement>(`canvas[data-page="${restored}"]`)?.scrollIntoView({ block: "start" })); setStatus("ready");
    } catch (error) { const details = error instanceof LegiscastPdfError ? { code: error.code, ...error.details } : { code: "unknown" }; console.error("legiscast_pdf_load_failed", { slug, materialId, hasRecorteId: Boolean(recorteId), ...details }); if (active) setStatus("error"); }
  }; void render(); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); if (objectUrlRef.current === objectUrl) objectUrlRef.current = ""; }; }, [slug, materialId, recorteId, zoom]);
  useEffect(() => { const viewport = viewportRef.current; if (!viewport || status !== "ready") return; const onScroll = () => { const canvases = [...viewport.querySelectorAll<HTMLCanvasElement>("canvas[data-page]")]; const top = viewport.getBoundingClientRect().top; const nearest = canvases.reduce((best, canvas) => Math.abs(canvas.getBoundingClientRect().top - top) < Math.abs(best.getBoundingClientRect().top - top) ? canvas : best, canvases[0]); const next = Number(nearest?.dataset.page); if (Number.isSafeInteger(next) && next !== page) { setPage(next); try { window.localStorage.setItem(storageKey(slug, recorteId), String(next)); } catch {} } }; viewport.addEventListener("scroll", onScroll, { passive: true }); return () => viewport.removeEventListener("scroll", onScroll); }, [page, slug, recorteId, status]);
  useEffect(() => { if (status === "ready") onReady?.(); if (status === "error") onError?.(); }, [status, onReady, onError]);
  async function openOutline(dest: unknown) { const pdf = documentRef.current; if (!pdf || !dest) return; try { const resolved = typeof dest === "string" ? await pdf.getDestination(dest) : dest; const reference = Array.isArray(resolved) ? resolved[0] : null; if (!reference) return; const target = await pdf.getPageIndex(reference) + 1; pagesRef.current?.querySelector<HTMLElement>(`canvas[data-page="${target}"]`)?.scrollIntoView({ block: "start" }); } catch {} }
  async function authorizedPdfBlob() { return fetchAuthorizedLegiscastPdf(slug, materialId, recorteId); }
  async function downloadPdf() { await downloadAuthorizedPdf(slug, materialId, recorteId, title); }
  async function printPdf() { await printAuthorizedPdf(slug, materialId, recorteId); }
  const Outline = ({ items, depth = 0 }: { items: OutlineItem[]; depth?: number }) => <ul className="grid gap-1">{items.map((item, index) => <li key={`${depth}-${index}-${item.title}`}><button type="button" onClick={() => void openOutline(item.dest)} className="w-full rounded px-2 py-1 text-left text-sm font-semibold text-blue-800 hover:bg-blue-50" style={{ paddingLeft: `${8 + depth * 14}px` }}>{item.title || "Seção"}</button>{item.items?.length ? <Outline items={item.items} depth={depth + 1} /> : null}</li>)}</ul>;
  return <div className="mt-0 min-w-0"><div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-slate-300 bg-slate-50 px-3 py-2"><p className="text-sm font-bold text-slate-700">{status === "ready" ? `Página ${page} de ${total}` : status === "error" ? "Não foi possível abrir o PDF" : "Carregando PDF…"}</p><div className="flex items-center gap-2"><button type="button" disabled={status !== "ready" || zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, Number((value - 0.25).toFixed(2))))} className="min-h-9 rounded border border-slate-300 bg-white px-3 font-black disabled:opacity-50" aria-label="Diminuir zoom">−</button><span className="text-sm font-bold text-slate-600">{Math.round(zoom * 100)}%</span><button type="button" disabled={status !== "ready" || zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} className="min-h-9 rounded border border-slate-300 bg-white px-3 font-black disabled:opacity-50" aria-label="Aumentar zoom">+</button><button type="button" onClick={() => void downloadPdf()} className="min-h-9 rounded border border-slate-300 bg-white px-3 text-sm font-bold text-blue-800">Baixar PDF</button><button type="button" onClick={() => void printPdf()} className="min-h-9 rounded border border-slate-300 bg-white px-3 text-sm font-bold text-blue-800">Imprimir</button></div></div>{outline.length ? <details className="border-x border-t border-slate-300 bg-white"><summary className="cursor-pointer px-3 py-2 text-sm font-black text-[#062a5f]">Sumário do PDF</summary><div className="max-h-56 overflow-auto border-t border-slate-200 p-2"><Outline items={outline} /></div></details> : null}<div ref={viewportRef} className="h-[52vh] min-h-[360px] overflow-auto overflow-x-auto rounded-b-xl border border-slate-300 bg-slate-100 sm:h-[62vh] sm:min-h-[460px] lg:h-[74vh] lg:min-h-[520px]" aria-label={`PDF: ${title}`}><div ref={pagesRef} /></div></div>;
}
