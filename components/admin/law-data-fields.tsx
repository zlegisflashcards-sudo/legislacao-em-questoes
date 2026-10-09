"use client";

import { useEffect, useState } from "react";
import { PUBLICATION_STATUSES, publicationStatusFromActive } from "@/lib/publication-status";

export type AdminLawData = Record<string, unknown>;

const text = (value: unknown) => value == null ? "" : String(value);

/** Campos canônicos do cadastro de lei, compartilhados pelos dois painéis administrativos. */
export function LawDataFields({ law, showFreeAccess = false }: { law: AdminLawData | null; showFreeAccess?: boolean }) {
  const [hasChange, setHasChange] = useState(law?.houve_alteracao_legislativa === true);

  useEffect(() => setHasChange(law?.houve_alteracao_legislativa === true), [law]);

  return <>
    <section className="law-data-section" aria-labelledby="law-data-identification">
      <header><div><h3 id="law-data-identification">Dados da lei</h3><p>Identificação e informações de exibição.</p></div></header>
      <div className="law-data-fields-grid">
        <label>Slug<input name="slug" defaultValue={text(law?.slug)} placeholder="slug-da-lei" required /></label>
        <label>Título<input name="titulo" defaultValue={text(law?.titulo)} placeholder="Título" required /></label>
        <label>Nome curto<input name="nome_curto" defaultValue={text(law?.nome_curto)} placeholder="Nome curto" /></label>
        <label>Código<input name="codigo" defaultValue={text(law?.codigo)} placeholder="Código" /></label>
        <label>Categoria<input name="categoria" defaultValue={text(law?.categoria)} placeholder="Categoria" /></label>
        <label>Ordem<input name="ordem" type="number" min="0" defaultValue={text(law?.ordem) || "0"} required /></label>
        <label className="law-data-wide">URL da miniatura<input name="thumbnail_url" defaultValue={text(law?.thumbnail_url)} placeholder="URL da miniatura" /></label>
        <label className="law-data-wide">Descrição<textarea name="descricao" defaultValue={text(law?.descricao)} placeholder="Descrição" /></label>
      </div>
    </section>

    <section className="law-data-section" aria-labelledby="law-data-publication">
      <header><div><h3 id="law-data-publication">Publicação e acesso</h3><p>Visibilidade comercial e acesso gratuito à lei.</p></div></header>
      <div className="law-data-publication-grid">
        <label>Status de publicação<select name="status_publicacao" defaultValue={typeof law?.status_publicacao === "string" ? law.status_publicacao : publicationStatusFromActive(law?.ativo !== false)}>{PUBLICATION_STATUSES.map((status) => <option key={status} value={status}>{status === "ativa" ? "Ativa" : status === "em_breve" ? "Em breve" : "Inativa"}</option>)}</select></label>
        {showFreeAccess ? <label className="law-data-free-access"><input type="hidden" name="acesso_gratuito" value="false" /><input type="checkbox" name="acesso_gratuito" value="true" defaultChecked={law?.acesso_gratuito === true} /><span><strong>Acesso gratuito</strong><span>Permite que qualquer aluno autenticado acesse esta lei sem liberação comercial.</span></span></label> : null}
      </div>
    </section>

    <section className="law-data-section" aria-labelledby="law-data-update">
      <header><div><h3 id="law-data-update">Atualização legislativa</h3><p>Referências e datas da norma originária e de suas alterações.</p></div></header>
      <div className="law-data-update-grid">
        <div className="law-data-reference-pair">
          <label>Norma originária<input name="norma_originaria_referencia" defaultValue={text(law?.norma_originaria_referencia)} placeholder="Ex.: Lei nº 10.230/2015" /></label>
          <label>Data da norma originária<input name="norma_originaria_data" type="date" defaultValue={text(law?.norma_originaria_data)} /></label>
        </div>
        <div className="law-data-status-grid">
          <label>Houve alteração legislativa?<select name="houve_alteracao_legislativa" value={hasChange ? "true" : "false"} onChange={(event) => setHasChange(event.target.value === "true")}><option value="false">Não</option><option value="true">Sim</option></select></label>
          <label>Situação de atualização<select name="situacao_atualizacao" defaultValue={text(law?.situacao_atualizacao) === "desatualizado" ? "desatualizado" : "atualizado"}><option value="atualizado">Atualizado</option><option value="desatualizado">Desatualizado</option></select></label>
          {law ? <label>Situação de conferência<select name="situacao_conferencia" defaultValue={text(law.situacao_conferencia)}><option value="">Sem marcação</option><option value="para_conferir">Para conferir</option><option value="conferido">Conferido</option></select></label> : null}
        </div>
        {hasChange ? <div className="law-data-reference-pair law-data-last-update">
          <label>Última alteração incorporada<input name="ultima_alteracao_referencia" defaultValue={text(law?.ultima_alteracao_referencia)} required /></label>
          <label>Data da última alteração<input name="ultima_alteracao_data" type="date" defaultValue={text(law?.ultima_alteracao_data)} required /></label>
        </div> : <>
          <input type="hidden" name="ultima_alteracao_referencia" value="" />
          <input type="hidden" name="ultima_alteracao_data" value="" />
        </>}
      </div>
    </section>
  </>;
}
