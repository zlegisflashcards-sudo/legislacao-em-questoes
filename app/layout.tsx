import type { Metadata } from "next";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Legislação em Questões",
  description: "Catálogo de legislações para estudo com flashcards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen flex-col bg-[#f7f8fb] text-slate-950">
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

              <nav className="flex flex-col gap-3 text-sm font-medium text-slate-200 sm:flex-row sm:items-center sm:gap-5">
                <a
                  href={siteConfig.links.minhasLeis}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-200 hover:text-white"
                >
                  🔐 Acessar minhas leis
                </a>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={siteConfig.links.encomendarLegislacao}
                    className="inline-flex items-center justify-center rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                  >
                    Encomendar Legislação
                  </a>
                  <a
                    href={siteConfig.links.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    WhatsApp
                  </a>
                </div>
              </nav>
            </div>
          </header>

          <main className="flex-1">{children}</main>

          <footer className="border-t border-slate-800 bg-black">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-5 py-6 text-sm text-slate-400 sm:px-6">
              <nav
                aria-label="Redes sociais e contatos"
                className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
              >
                <a
                  href="https://www.instagram.com/legis_flashcards/"
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-75 transition hover:opacity-100"
                  aria-label="Instagram"
                >
                  <img
                    src="/icons/instagram.png"
                    alt="Instagram"
                    className="h-5 w-5 object-contain"
                  />
                </a>
                <a
                  href="https://www.youtube.com/@Legisflashcards"
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-75 transition hover:opacity-100"
                  aria-label="YouTube"
                >
                  <img
                    src="/icons/youtube.png"
                    alt="YouTube"
                    className="h-5 w-5 object-contain"
                  />
                </a>
                <a
                  href="https://www.tiktok.com/@legis_flashcards?is_from_webapp=1&sender_device=pc"
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-75 transition hover:opacity-100"
                  aria-label="TikTok"
                >
                  <img
                    src="/icons/tiktok.png"
                    alt="TikTok"
                    className="h-5 w-5 object-contain"
                  />
                </a>
                <a
                  href="https://t.me/vademecumflashcards"
                  target="_blank"
                  rel="noreferrer"
                  className="opacity-75 transition hover:opacity-100"
                  aria-label="Comunidade Telegram"
                >
                  <img
                    src="/icons/telegram.png"
                    alt="Comunidade Telegram"
                    className="h-5 w-5 object-contain"
                  />
                </a>
              </nav>
              <a
                href="mailto:zlegisflashcards@gmail.com"
                className="text-xs text-slate-400 hover:text-blue-300"
              >
                zlegisflashcards@gmail.com
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
