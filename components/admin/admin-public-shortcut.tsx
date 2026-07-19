"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AdminPublicShortcutProps =
  | { variant: "panel"; slug?: never }
  | { variant: "manage"; slug: string };

export default function AdminPublicShortcut(props: AdminPublicShortcutProps) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function verificarSessao() {
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = (await response.json()) as { authenticated?: boolean };
        if (response.ok) setAuthenticated(result.authenticated === true);
      } catch {
        if (!controller.signal.aborted) setAuthenticated(false);
      }
    }

    void verificarSessao();
    return () => controller.abort();
  }, []);

  if (!authenticated) return null;

  if (props.variant === "manage") {
    return (
      <Link
        href={`/admin/legisbot?slug=${encodeURIComponent(props.slug)}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        aria-label={`Gerenciar comentários de ${props.slug} no painel administrativo`}
      >
        <span aria-hidden="true">🔧</span> Gerenciar
      </Link>
    );
  }

  return (
    <Link
      href="/admin/legisbot"
      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded px-3 py-2 text-center font-semibold text-blue-200 transition hover:bg-blue-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
      aria-label="Abrir painel administrativo do LegisBot"
      title="Abrir painel administrativo do LegisBot"
    >
      <span aria-hidden="true">🔧</span>
      <span className="hidden sm:inline">Painel</span>
    </Link>
  );
}
