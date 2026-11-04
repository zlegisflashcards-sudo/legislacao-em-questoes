import { redirect } from "next/navigation";
export const metadata={title:"Meus Atalhos | LegisFlashcards",description:"Acesse rapidamente suas leis e recortes de estudo."};
export default function MeuEditalPage(){ redirect("/minhas-leis?aba=atalhos"); }
