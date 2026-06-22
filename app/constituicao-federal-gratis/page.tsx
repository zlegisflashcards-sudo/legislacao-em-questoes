import { siteConfig } from "@/lib/site-config";
import {
  encontrarLegislacaoPorSlug,
  getLegislacoes,
  getYoutubeEmbedUrl,
} from "@/lib/legislacoes";

function getConfiguracaoConstituicaoGratis(
  constituicao: Awaited<ReturnType<typeof getLegislacoes>>[number] | undefined,
) {
  const configuracao = siteConfig.links.constituicaoGratis;

  return {
    legislacaoVideo:
      configuracao.legislacaoVideo ||
      (constituicao?.legiscastUrl
        ? getYoutubeEmbedUrl(constituicao.legiscastUrl)
        : ""),
    legislacaoDownload:
      configuracao.legislacaoDownload ||
      constituicao?.pdfEsquematizadoUrl ||
      "/leisflashcards/cf",
    flashcardsVideo:
      configuracao.flashcardsVideo ||
      (constituicao?.youtubeUrl
        ? getYoutubeEmbedUrl(constituicao.youtubeUrl)
        : ""),
    flashcardsDownload:
      configuracao.flashcardsDownload ||
      constituicao?.hotmartUrl ||
      "/leisflashcards/cf",
    encomendarFlashcards:
      configuracao.encomendarFlashcards ||
      siteConfig.links.encomendarLegislacao,
  };
}

function VideoFrame({ src, title }: { src: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
      {src ? (
        <iframe
          src={src}
          title={title}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <div className="flex aspect-video items-center justify-center px-6 text-center text-sm font-semibold text-slate-300">
          Vídeo configurável
        </div>
      )}
    </div>
  );
}

export default async function ConstituicaoFederalGratisPage() {
  const legislacoes = await getLegislacoes();
  const constituicao = encontrarLegislacaoPorSlug(legislacoes, "cf");
  const links = getConfiguracaoConstituicaoGratis(constituicao);

  return (
    <div className="bg-[#070b12]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-6 sm:py-12">
        <a
          href="/"
          className="w-fit text-sm font-semibold text-slate-300 hover:text-blue-300"
        >
          ← Voltar para a Home
        </a>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.12)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="space-y-3">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
                Etapa 1
              </p>
              <h1 className="text-3xl font-black leading-tight text-[#062a5f] sm:text-4xl">
                Estudando a legislação esquematizada
              </h1>
              <p className="text-base leading-7 text-slate-700">
                Enquanto a legislação esquematizada organiza e destaca os
                pontos mais importantes do texto legal, o Legiscast complementa
                o estudo com explicações artigo por artigo, tornando a leitura
                mais dinâmica e facilitando a compreensão do conteúdo.
              </p>
            </div>

            <div className="space-y-4">
              <VideoFrame
                src={links.legislacaoVideo}
                title="Constituição Federal esquematizada com Legiscast"
              />
              <a
                href={links.legislacaoDownload}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg bg-green-500 px-6 py-4 text-center text-sm font-black text-white shadow-[0_16px_34px_rgba(34,197,94,0.28)] transition hover:-translate-y-0.5 hover:bg-green-400 sm:text-base"
              >
                Baixar Constituição Federal esquematizada
              </a>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.12)] sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="space-y-3">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
                Etapa 2
              </p>
              <h2 className="text-3xl font-black leading-tight text-[#062a5f] sm:text-4xl">
                Legislação EM QUESTÕES
              </h2>
              <p className="text-base leading-7 text-slate-700">
                Depois de entender a lei, resolva os flashcards para fixar na
                memória, treinar para as pegadinhas das bancas e programar a
                revisão de longo prazo.
              </p>
            </div>

            <div className="space-y-4">
              <VideoFrame
                src={links.flashcardsVideo}
                title="Como estudar flashcards da Constituição Federal no Anki"
              />
              <a
                href={links.flashcardsDownload}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg bg-green-500 px-6 py-4 text-center text-sm font-black text-white shadow-[0_16px_34px_rgba(34,197,94,0.28)] transition hover:-translate-y-0.5 hover:bg-green-400 sm:text-base"
              >
                Baixar flashcards da Constituição Federal
              </a>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-blue-200/40 bg-[#062a5f] p-6 text-white shadow-[0_22px_55px_rgba(6,42,95,0.28)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div className="space-y-4">
              <h2 className="text-3xl font-black leading-tight">
                Quer sua legislação nesse padrão?
              </h2>
              <p className="text-base leading-7 text-blue-50">
                <em>Não produzimos materiais em massa.</em> Cada legislação é
                elaborada artigo por artigo por um especialista em estudo da
                legislação para concurso. O resultado é um material pensado para
                ajudar o aluno a compreender, revisar e memorizar a lei de
                forma eficiente.
              </p>
            </div>

            <div className="space-y-5 rounded-lg border border-white/15 bg-black/15 p-5">
              <ul className="space-y-3 text-sm font-semibold leading-6 text-blue-50">
                {[
                  "Legislação esquematizada",
                  "Flashcards revisados",
                  "Legiscast",
                  "Produção artigo por artigo",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-green-300">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <a
                href={links.encomendarFlashcards}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg bg-white px-6 py-4 text-center text-sm font-black text-[#062a5f] shadow-[0_16px_34px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-blue-50 sm:text-base"
              >
                Encomendar flashcards
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
