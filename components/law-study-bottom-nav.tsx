import Link from "next/link";
import Image from "next/image";

export type LawStudyMode = "questoes" | "anki" | "legiscast";

function href(slug: string, suffix: string, recorteId: string | null) {
  return `/estudar/lei/${encodeURIComponent(slug)}${suffix}${recorteId ? `?recorte_id=${encodeURIComponent(recorteId)}` : ""}`;
}

export function LawStudyBottomNav({ slug, recorteId, activeMode }: { slug: string; recorteId: string | null; activeMode: LawStudyMode }) {
  const items = [
    { mode: "questoes" as const, label: "Legis Questões", icon: "🎮", suffix: "" },
    { mode: "anki" as const, label: "Anki", icon: "/icons/anki.png", suffix: "/anki" },
    { mode: "legiscast" as const, label: "LegisCast", icon: "🎧", suffix: "/legiscast" },
  ];
  return <nav aria-label="Modos de estudo da lei" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,.1)] backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}><div className="mx-auto grid max-w-lg grid-cols-3 gap-1">{items.map((item) => { const active = item.mode === activeMode; return <Link key={item.mode} href={href(slug, item.suffix, recorteId)} aria-current={active ? "page" : undefined} className={`flex min-h-16 flex-col items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-[#062a5f]"}`}>{item.mode === "anki" ? <Image src={item.icon} alt="" aria-hidden="true" width={24} height={24} className="h-6 w-6 object-contain" /> : <span aria-hidden="true" className="text-xl leading-none">{item.icon}</span>}<span className="mt-1">{item.label}</span></Link>; })}</div></nav>;
}
