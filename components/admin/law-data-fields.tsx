"use client";

import { useEffect, useState } from "react";

export type AdminLawData = Record<string, unknown>;

const text = (value: unknown) => value == null ? "" : String(value);

/** Campos canônicos do cadastro de lei, compartilhados pelos dois painéis administrativos. */
export function LawDataFields({ law }: { law: AdminLawData | null }) {
  const [hasChange, setHasChange] = useState(law?.houve_alteracao_legislativa === true);

  useEffect(() => setHasChange(law?.houve_alteracao_legislativa === true), [law]);

  return <>
    <input name="slug" defaultValue={text(law?.slug)} placeholder="slug-da-lei" required />
    <input name="titulo" defaultValue={text(law?.titulo)} placeholder="Título" required />
    <input name="nome_curto" defaultValue={text(law?.nome_curto)} placeholder="Nome curto" />
    <input name="codigo" defaultValue={text(law?.codigo)} placeholder="Código" />
    <input name="categoria" defaultValue={text(law?.categoria)} placeholder="Categoria" />
    <input name="thumbnail_url" defaultValue={text(law?.thumbnail_url)} placeholder="URL da miniatura" />
    <textarea name="descricao" defaultValue={text(law?.descricao)} placeholder="Descrição" />
    <input name="ordem" type="number" min="0" defaultValue={text(law?.ordem) || "0"} required />
    <select name="ativo" defaultValue={law?.ativo === false ? "false" : "true"}><option value="true">Ativa</option><option value="false">Inativa</option></select>
    <label>Norma originária<input name="norma_originaria_referencia" defaultValue={text(law?.norma_originaria_referencia)} placeholder="Ex.: Lei nº 10.230/2015" /></label>
    <label>Data da norma originária<input name="norma_originaria_data" type="date" defaultValue={text(law?.norma_originaria_data)} /></label>
    <label>Houve alteração legislativa?<select name="houve_alteracao_legislativa" value={hasChange ? "true" : "false"} onChange={(event) => setHasChange(event.target.value === "true")}><option value="false">Não</option><option value="true">Sim</option></select></label>
    {hasChange ? <>
      <label>Última alteração incorporada<input name="ultima_alteracao_referencia" defaultValue={text(law?.ultima_alteracao_referencia)} required /></label>
      <label>Data da última alteração<input name="ultima_alteracao_data" type="date" defaultValue={text(law?.ultima_alteracao_data)} required /></label>
    </> : <>
      <input type="hidden" name="ultima_alteracao_referencia" value="" />
      <input type="hidden" name="ultima_alteracao_data" value="" />
    </>}
    <label>Situação de atualização<select name="situacao_atualizacao" defaultValue={text(law?.situacao_atualizacao) || "revisao_pendente"}>{["atualizado", "revisao_pendente", "desatualizado", "em_revisao"].map((item) => <option key={item}>{item}</option>)}</select></label>
  </>;
}
