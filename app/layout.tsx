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
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <a href="/" className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded bg-blue-700 text-sm font-bold text-white">
                  LQ
                </span>
                <span className="text-base font-bold text-slate-950">
                  Legislação em Questões
                </span>
              </a>

              <nav className="flex flex-col gap-3 text-sm font-medium text-slate-700 sm:flex-row sm:items-center sm:gap-5">
                <div className="flex flex-wrap items-center gap-4">
                  <a href="/" className="hover:text-blue-700">
                    Início
                  </a>
                  <a href="/" className="hover:text-blue-700">
                    Categorias
                  </a>
                  <a href="/" className="hover:text-blue-700">
                    Atualizações
                  </a>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={siteConfig.links.encomendarLegislacao}
                    className="inline-flex items-center justify-center rounded border border-blue-700 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
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

          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p>Legislação em Questões</p>
              <p>Catálogo de legislações para estudo com flashcards.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
