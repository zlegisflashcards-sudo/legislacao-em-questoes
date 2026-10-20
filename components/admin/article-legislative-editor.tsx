"use client";

import { useRef, useState } from "react";

type Props = { initialHtml: string; name?: string };

const previewDocument = (html: string) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033}body{margin:0;padding:20px;line-height:1.7;overflow-wrap:anywhere}p,div,li,blockquote,th,td{white-space:pre-wrap}p{margin:.65em 0}table{display:block;max-width:100%;overflow:auto;border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;vertical-align:top}th{background:#eff6ff;font-weight:800}blockquote{margin:.8em 0;border-left:3px solid #3b82f6;padding-left:12px;color:#334155}mark{background:#fef08a}
  </style></head><body>${html}</body></html>`;

export function ArticleLegislativeEditor({ initialHtml, name = "legislation" }: Props) {
  const [html, setHtml] = useState(initialHtml);
  const [mode, setMode] = useState<"visual" | "html" | "preview">("visual");
  const editable = useRef<HTMLDivElement>(null);

  const sync = () => setHtml(editable.current?.innerHTML ?? "");
  const command = (commandName: string, value?: string) => {
    editable.current?.focus();
    document.execCommand(commandName, false, value);
    sync();
  };
  const insertTable = () => {
    editable.current?.focus();
    document.execCommand("insertHTML", false, "<table><thead><tr><th>Princípio</th><th>Descrição</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p><br></p>");
    sync();
  };

  return <section className="article-legislative-editor" aria-label="Edição da legislação preparada">
    <input type="hidden" name={name} value={html} />
    <div className="article-legislative-editor-toolbar" role="toolbar" aria-label="Ferramentas de formatação">
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("bold")}><strong>N</strong><span className="sr-only">Negrito</span></button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("italic")}><em>I</em><span className="sr-only">Itálico</span></button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("underline")}><u>S</u><span className="sr-only">Sublinhado</span></button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("foreColor", "#0755c8")} aria-label="Texto azul">A</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("hiliteColor", "#fef08a")} aria-label="Destacar texto">▰</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("insertUnorderedList")} aria-label="Lista">• Lista</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => command("insertOrderedList")} aria-label="Lista numerada">1. Lista</button>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertTable}>Tabela</button>
      <span className="article-legislative-editor-spacer" />
      <button type="button" className={mode === "visual" ? "is-active" : ""} onClick={() => setMode("visual")}>Editar</button>
      <button type="button" className={mode === "html" ? "is-active" : ""} onClick={() => setMode("html")}>HTML</button>
      <button type="button" className={mode === "preview" ? "is-active" : ""} onClick={() => setMode("preview")}>Prévia</button>
    </div>
    {mode === "visual" ? <div ref={editable} className="article-legislative-editor-canvas legisbot-legal-html" contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: html }} onInput={sync} aria-label="Editor visual da legislação" /> : null}
    {mode === "html" ? <textarea className="article-legislative-editor-source" value={html} onChange={(event) => setHtml(event.target.value)} spellCheck={false} aria-label="Código HTML da legislação" /> : null}
    {mode === "preview" ? <iframe className="article-legislative-editor-preview" title="Prévia da legislação preparada" sandbox="" srcDoc={previewDocument(html)} /> : null}
    <p className="article-interaction-note">Use <strong>Editar</strong> para formatação visual, <strong>HTML</strong> para ajustar o código e <strong>Prévia</strong> para conferir a leitura. Nada é gravado até salvar a base.</p>
  </section>;
}
