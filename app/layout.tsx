import type { Metadata } from "next";
import { SiteShell } from "@/components/site-shell";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.legisflashcards.com.br",
  ),
  title: "LegisFlashcards",
  description: "Materiais de legislação organizados para concursos.",
  openGraph: {
    siteName: "LegisFlashcards",
    title: "LegisFlashcards",
    description: "Materiais de legislação organizados para concursos.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "LegisFlashcards",
    description: "Materiais de legislação organizados para concursos.",
  },
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning><body><SiteShell>{children}</SiteShell></body></html>;
}
