"use client";

import { useState } from "react";
import type { LegiscastItem } from "@/lib/legiscast";

function getFallbackLabel(item: LegiscastItem) {
  if (item.sigla) return item.sigla;

  return item.titulo
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 3)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || item.titulo;
}

export function LegiscastCard({ item }: { item: LegiscastItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.thumbnailUrl) && !imageFailed;

  return (
    <article className="h-full">
      <a
        href={`/leis/${encodeURIComponent(item.slug)}`}
        aria-label={`Abrir Central da Lei: ${item.titulo}`}
        className="group block overflow-hidden rounded-2xl border border-blue-300/15 bg-[#0f1d31] shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition duration-200 hover:-translate-y-1 hover:border-blue-300/35 hover:shadow-[0_20px_42px_rgba(3,16,35,0.38)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#28b7ff]"
      >
        <div className="relative aspect-video overflow-hidden bg-[radial-gradient(circle_at_22%_18%,#1e67a2_0%,#123c74_34%,#07172d_78%)]">
          {showImage ? (
            // A origem da imagem é configurável na planilha; <img> preserva esse suporte sem uma allowlist global.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.thumbnailUrl}
              alt={`Capa de ${item.titulo}`}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="relative flex h-full items-center justify-center overflow-hidden px-6 text-center" role="img" aria-label={`Capa de ${item.titulo}`}>
              <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 rounded-full border-[22px] border-[#28b7ff]/10" />
              <div aria-hidden="true" className="absolute -bottom-14 -left-8 h-36 w-36 rounded-full bg-blue-400/10 blur-xl" />
              <span className="relative text-3xl font-black tracking-[0.08em] text-blue-100 drop-shadow-lg sm:text-4xl">
                {getFallbackLabel(item)}
              </span>
            </div>
          )}
        </div>
      </a>
    </article>
  );
}
