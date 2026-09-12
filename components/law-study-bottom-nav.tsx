import Link from "next/link";
import Image from "next/image";

export type LawStudyMode = "questoes" | "anki" | "legiscast";

const studyModes = [
  { mode: "questoes" as const, label: "Legis Questões", icon: "🎮", suffix: "" },
  { mode: "anki" as const, label: "Anki", icon: "/icons/anki.png", suffix: "/anki" },
  { mode: "legiscast" as const, label: "LegisCast", icon: "🎧", suffix: "/legiscast" },
];

function href(slug: string, suffix: string, recorteId: string | null) {
  return `/estudar/lei/${encodeURIComponent(slug)}${suffix}${recorteId ? `?recorte_id=${encodeURIComponent(recorteId)}` : ""}`;
}

export function LawStudyBottomNav({ slug, recorteId, activeMode }: { slug: string; recorteId: string | null; activeMode: LawStudyMode }) {
  return <>
    <nav aria-label="Modos de estudo da lei" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-8px_24px_rgba(15,23,42,.1)] backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-1">
        {studyModes.map((item) => <StudyNavLink key={item.mode} item={item} slug={slug} recorteId={recorteId} active={item.mode === activeMode} variant="mobile" />)}
      </div>
    </nav>
    <nav aria-label="Modos de estudo da lei" className="fixed right-5 top-1/2 z-40 hidden w-44 -translate-y-1/2 flex-col gap-1 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_14px_35px_rgba(15,23,42,.16)] backdrop-blur lg:flex">
      {studyModes.map((item) => <StudyNavLink key={item.mode} item={item} slug={slug} recorteId={recorteId} active={item.mode === activeMode} variant="desktop" />)}
    </nav>
  </>;
}

function StudyNavLink({ item, slug, recorteId, active, variant }: { item: typeof studyModes[number]; slug: string; recorteId: string | null; active: boolean; variant: "mobile" | "desktop" }) {
  const activeStyle = active ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-[#062a5f]";
  const mobile = variant === "mobile";
  return <Link href={href(slug, item.suffix, recorteId)} aria-current={active ? "page" : undefined} className={`flex min-h-16 items-center rounded-xl px-2 py-2 font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${mobile ? "flex-col justify-center text-center text-xs" : "gap-3 text-sm"} ${activeStyle}`}>
    {item.mode === "anki" ? <Image src={item.icon} alt="" aria-hidden="true" width={mobile ? 24 : 22} height={mobile ? 24 : 22} className={`${mobile ? "h-6 w-6" : "h-[22px] w-[22px]"} shrink-0 object-contain`} /> : <span aria-hidden="true" className={`${mobile ? "text-xl" : "text-lg"} leading-none`}>{item.icon}</span>}
    <span className={mobile ? "mt-1" : "min-w-0"}>{item.label}</span>
  </Link>;
}
