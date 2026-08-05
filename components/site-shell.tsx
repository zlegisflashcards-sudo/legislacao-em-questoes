"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <>{children}</>;
  }

  const isLegisBotEnvironment = pathname === "/legisbot" || pathname.startsWith("/legisbot/");
  const socials = [
    ["youtube", "https://www.youtube.com/@Legisflashcards", "YouTube"],
    ["tiktok", "https://www.tiktok.com/@legis_flashcards?is_from_webapp=1&sender_device=pc", "TikTok"],
    ["telegram", "https://t.me/vademecumflashcards", "Comunidade Telegram"],
    ["gmail", "mailto:zlegisflashcards@gmail.com", "Gmail"],
  ];

  return <div className="flex min-h-screen flex-col bg-[#f7f8fb] text-slate-950">
    <SiteHeader />
    <main className="flex-1">{children}</main>
    {!isLegisBotEnvironment ? <footer className="border-t border-slate-800 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-7 text-sm text-slate-400 sm:flex-row sm:px-6">
        <p className="text-center sm:text-left">© LegisFlashcards — Legislação para Concursos</p>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <nav aria-label="Redes sociais e contatos" className="flex items-center justify-center gap-4">
            {socials.map(([icon, href, label]) => <a key={icon} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} className="opacity-80 transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300" aria-label={label}><img src={`/icons/${icon}.png`} alt="" className="h-7 w-7 object-contain" /></a>)}
          </nav>
          <a href="/termos-e-privacidade" className="font-semibold text-slate-200 transition hover:text-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300">Termos e Privacidade</a>
        </div>
      </div>
    </footer> : null}
  </div>;
}
