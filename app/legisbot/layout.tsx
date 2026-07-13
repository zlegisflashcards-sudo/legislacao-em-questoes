import Script from "next/script";

export const metadata = { title: "LegisBot | LegisFlashcards", description: "Seu assistente de legislação." };

export default function LegisBotLayout({ children }: { children: React.ReactNode }) {
  return <><Script id="legisbot-theme-init" strategy="beforeInteractive">{`try{document.documentElement.dataset.legisbotTheme=localStorage.getItem('legisbot-theme')||'light'}catch(e){document.documentElement.dataset.legisbotTheme='light'}`}</Script>{children}</>;
}
