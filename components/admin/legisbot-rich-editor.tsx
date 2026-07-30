"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { TableKit } from "@tiptap/extension-table";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef } from "react";

import { validarEstruturaHtml } from "@/lib/legisbot/prepare-comment-html";
import { sanitizarComentarioHtml } from "@/lib/legisbot/sanitize-comment-html";

type LegisBotRichEditorProps = {
  error?: string;
  onChange: (html: string) => void;
  value: string;
};

const HighlightBlock = Node.create({
  name: "legisbotHighlight",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div.legisbot-highlight" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "legisbot-highlight" }),
      0,
    ];
  },
});

function safeEditorContent(value: string) {
  return sanitizarComentarioHtml(value) || "<p></p>";
}

export function LegisBotRichEditor({ error, onChange, value }: LegisBotRichEditorProps) {
  const onChangeRef = useRef(onChange);
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const structureError = useMemo(() => validarEstruturaHtml(value), [value]);
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, value.split("\n").length) }, (_, index) => index + 1),
    [value],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          autolink: false,
          defaultProtocol: "https",
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_blank",
          },
        },
      }),
      TableKit.configure({
        table: { resizable: true },
      }),
      HighlightBlock,
    ],
    content: safeEditorContent(value),
    editorProps: {
      attributes: {
        "aria-label": "Editor visual do comentário",
        class: "admin-visual-editor-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(sanitizarComentarioHtml(currentEditor.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const safeValue = safeEditorContent(value);
    const currentValue = safeEditorContent(editor.getHTML());

    if (safeValue === currentValue) {
      return;
    }

    editor.commands.setContent(safeValue, {
      emitUpdate: false,
      errorOnInvalidContent: false,
    });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      blockquote: currentEditor?.isActive("blockquote") ?? false,
      bold: currentEditor?.isActive("bold") ?? false,
      bulletList: currentEditor?.isActive("bulletList") ?? false,
      h2: currentEditor?.isActive("heading", { level: 2 }) ?? false,
      h3: currentEditor?.isActive("heading", { level: 3 }) ?? false,
      highlight: currentEditor?.isActive("legisbotHighlight") ?? false,
      italic: currentEditor?.isActive("italic") ?? false,
      link: currentEditor?.isActive("link") ?? false,
      orderedList: currentEditor?.isActive("orderedList") ?? false,
      paragraph: currentEditor?.isActive("paragraph") ?? false,
      table: currentEditor?.isActive("table") ?? false,
    }),
  });

  function setLink() {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Endereço do link (https:// ou mailto:)", previousUrl ?? "https://");

    if (url === null) {
      return;
    }

    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert("Use um endereço iniciado por https://, http:// ou mailto:.");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function syncLineNumberScroll() {
    if (lineNumbersRef.current && codeRef.current) {
      lineNumbersRef.current.scrollTop = codeRef.current.scrollTop;
    }
  }

  return (
    <section className="admin-editor-grid" aria-label="Editor bidirecional do comentário">
      <div className="admin-editor-pane admin-code-pane">
        <div className="admin-editor-pane-header">
          <div>
            <strong>HTML</strong>
            <span>Código persistido no banco</span>
          </div>
          <code>slug + ordem</code>
        </div>

        <div className={`admin-code-shell${structureError ? " has-error" : ""}`}>
          <div ref={lineNumbersRef} className="admin-code-line-numbers" aria-hidden="true">
            {lineNumbers.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <textarea
            ref={codeRef}
            aria-label="Código HTML do comentário"
            className="admin-html-editor"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onScroll={syncLineNumberScroll}
            required
            spellCheck={false}
          />
        </div>

        <input type="hidden" name="comentario" value={value} />
        {structureError ? <p className="admin-editor-warning">{structureError}</p> : null}
        {error ? <span className="admin-field-error">{error}</span> : null}
      </div>

      <div className="admin-editor-pane admin-visual-pane">
        <div className="admin-editor-pane-header">
          <div>
            <strong>Editor visual</strong>
            <span>Edite o conteúdo formatado diretamente</span>
          </div>
          <span className="admin-editor-live-status">Sincronização ao vivo</span>
        </div>

        <div className="admin-visual-toolbar" role="toolbar" aria-label="Formatação do comentário">
          <button type="button" className={state?.paragraph ? "is-active" : ""} onClick={() => editor?.chain().focus().setParagraph().run()}>P</button>
          <button type="button" className={state?.h2 ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button type="button" className={state?.h3 ? "is-active" : ""} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
          <span className="admin-toolbar-divider" />
          <button type="button" className={state?.bold ? "is-active" : ""} aria-label="Negrito" title="Negrito" onClick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
          <button type="button" className={state?.italic ? "is-active" : ""} aria-label="Itálico" title="Itálico" onClick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
          <button type="button" className={state?.bulletList ? "is-active" : ""} aria-label="Lista com marcadores" title="Lista com marcadores" onClick={() => editor?.chain().focus().toggleBulletList().run()}>• Lista</button>
          <button type="button" className={state?.orderedList ? "is-active" : ""} aria-label="Lista numerada" title="Lista numerada" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>1. Lista</button>
          <button type="button" className={state?.blockquote ? "is-active" : ""} aria-label="Citação" title="Citação" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>❝</button>
          <button type="button" className={state?.highlight ? "is-active" : ""} aria-label="Bloco de destaque" title="Bloco de destaque" onClick={() => editor?.chain().focus().toggleWrap("legisbotHighlight").run()}>Destaque</button>
          <button type="button" className={state?.link ? "is-active" : ""} aria-label="Link" title="Inserir ou editar link" onClick={setLink}>🔗</button>
          <button type="button" aria-label="Separador" title="Inserir separador" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>―</button>
          <span className="admin-toolbar-divider" />
          <button type="button" aria-label="Desfazer" title="Desfazer" onClick={() => editor?.chain().focus().undo().run()}>↶</button>
          <button type="button" aria-label="Refazer" title="Refazer" onClick={() => editor?.chain().focus().redo().run()}>↷</button>
          <span className="admin-toolbar-divider" />
          {!state?.table ? (
            <button type="button" aria-label="Inserir tabela" title="Inserir tabela" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦ Tabela</button>
          ) : (
            <>
              <button type="button" title="Adicionar coluna" onClick={() => editor?.chain().focus().addColumnAfter().run()}>+ coluna</button>
              <button type="button" title="Adicionar linha" onClick={() => editor?.chain().focus().addRowAfter().run()}>+ linha</button>
              <button type="button" title="Excluir coluna" onClick={() => editor?.chain().focus().deleteColumn().run()}>− coluna</button>
              <button type="button" title="Excluir linha" onClick={() => editor?.chain().focus().deleteRow().run()}>− linha</button>
              <button type="button" title="Excluir tabela" onClick={() => editor?.chain().focus().deleteTable().run()}>Excluir tabela</button>
            </>
          )}
        </div>

        <div className="admin-visual-editor-scroll">
          <EditorContent editor={editor} />
        </div>
      </div>
    </section>
  );
}
