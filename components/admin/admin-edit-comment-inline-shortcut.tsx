"use client";

import { useEffect, useState } from "react";
import LegisBotEditor from "@/components/admin/legisbot-editor";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";

export default function AdminEditCommentInlineShortcut({ record }: { record: LegisBotComentario }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <>
    <button
      type="button"
      className="admin-edit-comment-shortcut"
      aria-label="Editar este comentário aqui"
      title="Editar comentário"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <span aria-hidden="true">🔧</span>
      <span className="admin-edit-comment-label">Editar comentário</span>
    </button>
    {open ? <div className="legisbot-inline-editor-backdrop" role="presentation">
      <section className="legisbot-inline-editor" role="dialog" aria-modal="true" aria-label="Editar comentário do LegisBot">
        <button type="button" className="legisbot-inline-editor-close" aria-label="Fechar edição do comentário" onClick={() => setOpen(false)}>×</button>
        <LegisBotEditor record={record} />
      </section>
    </div> : null}
  </>;
}
