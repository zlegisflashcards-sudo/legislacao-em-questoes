"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminPublicShortcut from "@/components/admin/admin-public-shortcut";
import { LegiscastHeader } from "@/components/legiscast-header";
import { siteConfig } from "@/lib/site-config";

function WhatsAppIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="h-5 w-5 shrink-0"
      fill="currentColor"
    >
      <path d="M16.04 3.2A12.74 12.74 0 0 0 5.12 22.5L3.5 28.8l6.45-1.68A12.74 12.74 0 1 0 16.04 3.2Zm0 2.28a10.46 10.46 0 0 1 8.85 16.03 10.46 10.46 0 0 1-13.98 3.36l-.46-.28-3.84 1 1.02-3.74-.3-.48a10.46 10.46 0 0 1 8.71-15.89Zm-4.45 5.58c-.24 0-.62.09-.95.45-.33.36-1.25 1.22-1.25 2.98 0 1.75 1.28 3.45 1.46 3.68.18.24 2.47 3.95 6.1 5.38 3.02 1.19 3.64.95 4.3.89.66-.06 2.12-.86 2.42-1.7.3-.83.3-1.54.21-1.7-.09-.15-.33-.24-.69-.42-.36-.18-2.12-1.04-2.45-1.16-.33-.12-.57-.18-.81.18-.24.36-.93 1.16-1.14 1.4-.21.24-.42.27-.78.09-.36-.18-1.52-.56-2.9-1.78-1.07-.95-1.79-2.13-2-2.49-.21-.36-.02-.55.16-.73.16-.16.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.29-.7-.58-.6-.81-.61h-.63Z" />
    </svg>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    return <>{children}</>;
  }

  const isLegisFlashcardsEnvironment =
    pathname === "/" || pathname.startsWith("/leisflashcards/");
  const isLegisBotEnvironment =
    pathname === "/legisbot" || pathname.startsWith("/legisbot/");

  const socials = [
    ["youtube", "https://www.youtube.com/@Legisflashcards", "YouTube"],
    [
      "tiktok",
      "https://www.tiktok.com/@legis_flashcards?is_from_webapp=1&sender_device=pc",
      "TikTok",
    ],
    ["telegram", "https://t.me/vademecumflashcards", "Comunidade Telegram"],
    ["gmail", "mailto:zlegisflashcards@gmail.com", "Gmail"],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fb] text-slate-950">
      {isLegisFlashcardsEnvironment ? (
        <header className="border-b border-slate-800 bg-black">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <a href="/" className="flex items-center gap-3">
            <img
              src="/logo-legis.png"
              alt="Legis Flashcards"
              className="h-11 w-11 rounded object-contain"
            />
            <span className="text-base font-bold text-white sm:text-lg">
              Legislação em Questões
            </span>
          </a>

          <nav className="grid gap-2 text-sm font-medium text-slate-200 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
            <AdminPublicShortcut variant="panel" />
            <a
              href={siteConfig.links.minhasLeis}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-3 py-2 text-center font-semibold text-white transition hover:bg-blue-600"
            >
              🔐 Minhas leis adquiridas
            </a>
            <a
              href="/legiscast"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-300/30 px-3 py-2 text-center font-semibold text-blue-100 transition hover:bg-blue-950 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
            >
              LegisCast TV
            </a>
            <a
              href={siteConfig.links.whatsapp}
              target="_blank"
              rel="noreferrer"
              aria-label="Falar com a LegisFlashcards pelo WhatsApp"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-center font-semibold text-white transition hover:bg-green-700"
            >
              <WhatsAppIcon />
              WhatsApp
            </a>
          </nav>
        </div>
        </header>
      ) : (
        <LegiscastHeader />
      )}

      <main className="flex-1">{children}</main>

      {!isLegisBotEnvironment ? (
      <footer className="border-t border-slate-800 bg-black">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-7 text-sm text-slate-400 sm:flex-row sm:px-6">
          <p className="text-center sm:text-left">
            © LegisFlashcards — Legislação em Questões
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <nav
              aria-label="Redes sociais e contatos"
              className="flex items-center justify-center gap-4"
            >
              {socials.map(([icon, href, label]) => (
                <a
                  key={icon}
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noreferrer" : undefined}
                  className="opacity-80 transition hover:opacity-100"
                  aria-label={label}
                >
                  <img
                    src={`/icons/${icon}.png`}
                    alt={label}
                    className="h-7 w-7 object-contain"
                  />
                </a>
              ))}
            </nav>
            <a
              href="/termos-e-privacidade"
              className="font-semibold text-slate-200 transition hover:text-blue-300"
            >
              Termos e Privacidade
            </a>
          </div>
        </div>
      </footer>
      ) : null}
    </div>
  );
}
