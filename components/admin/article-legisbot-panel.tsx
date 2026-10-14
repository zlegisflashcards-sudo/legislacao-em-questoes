import Link from "next/link";
import { gerarComentarioLegisBotAdministrativo, prepararContextoLegisBot } from "@/app/admin/actions";
import LegisBotEditor from "@/components/admin/legisbot-editor";
import type { LegislativeReference } from "@/lib/admin-legislative-references";
import type { LegisBotComentario } from "@/lib/legisbot-comentario";

type Props = {
  slug: string;
  ordem: string;
  baseHref: string;
  publicUrl: string;
  reference: LegislativeReference | null;
  record: LegisBotComentario | null;
};

export function ArticleLegisBotPanel({ slug, ordem, baseHref, publicUrl, reference, record }: Props) {
  const hasPreparedLegislation = Boolean(reference?.legislation?.trim());

  return <section className="article-legisbot">
    <header>
      <div>
        <h2>Conteúdo do LegisBot</h2>
        <p>O LegisBot usa a base legislativa preparada deste dispositivo e permanece independente dos conflitos das questões.</p>
      </div>
      <Link className="admin-button secondary" href={publicUrl} target="_blank">Visualizar página pública</Link>
    </header>

    {record ? <LegisBotEditor record={record} returnHref={`${baseHref}?aba=legisbot`} /> : hasPreparedLegislation ? <div className="admin-empty">
      <h2>Preparar conteúdo do LegisBot</h2>
      <p>A legislação preparada está disponível. Você pode começar um rascunho manual ou gerar o conteúdo pela API.</p>
      <div className="article-header-actions">
        <form action={prepararContextoLegisBot}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="ordem" value={ordem} />
          <input type="hidden" name="return_to" value={`${baseHref}?aba=legisbot`} />
          <button className="admin-button secondary">Criar conteúdo manualmente</button>
        </form>
        <form action={gerarComentarioLegisBotAdministrativo}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="ordem" value={ordem} />
          <input type="hidden" name="return_to" value={`${baseHref}?aba=legisbot`} />
          <button className="admin-button primary">Gerar com API</button>
        </form>
      </div>
    </div> : <div className="admin-empty">
      <h2>Legislação preparada necessária</h2>
      <p>Preencha a base legislativa na aba Artigo antes de criar ou gerar o LegisBot. Conflitos das questões não impedem este fluxo.</p>
      <Link className="admin-button primary" href={`${baseHref}?aba=artigo`}>Abrir base legislativa</Link>
    </div>}
  </section>;
}
