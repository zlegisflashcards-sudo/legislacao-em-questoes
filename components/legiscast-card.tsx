import type { LegiscastItem } from "@/lib/legiscast";

export function LegiscastCard({ item }: { item: LegiscastItem }) {
  return (
    <article className="h-full">
      <a
        href={`/leis/${encodeURIComponent(item.slug)}`}
        aria-label={`Abrir Central da Lei: ${item.titulo}`}
        className="group flex h-full min-h-24 items-center justify-between gap-4 rounded-xl border border-blue-300/15 bg-[#0f1d31] px-5 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/35 hover:bg-[#13243c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#28b7ff]"
      >
        <span className="min-w-0 text-base font-black leading-6 text-white">
          {item.titulo}
        </span>
        <span
          className="shrink-0 text-lg font-black text-[#28b7ff] transition group-hover:translate-x-1"
          aria-hidden="true"
        >
          →
        </span>
      </a>
    </article>
  );
}
