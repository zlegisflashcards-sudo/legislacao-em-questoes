"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

/**
 * Editor leve para HTML já persistido nas questões. Não sanitiza nem reserializa
 * o valor ao abrir ou salvar sem edição; o player continua sendo responsável pela
 * sanitização de exibição ao aluno.
 */
export function QuestionRichEditor({ label, value, onChange, required = false }: Props) {
  const [htmlMode, setHtmlMode] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!htmlMode && visualRef.current && visualRef.current.innerHTML !== value) {
      visualRef.current.innerHTML = value;
    }
  }, [htmlMode, value]);

  function toggleMode() {
    if (!htmlMode && visualRef.current) onChange(visualRef.current.innerHTML);
    setHtmlMode((current) => !current);
  }

  return <section className="question-rich-field">
    <header><label>{label}{required ? " *" : ""}</label><button type="button" onClick={toggleMode} aria-label={`Alternar ${label} entre visual e HTML`} title="Alternar visual/HTML">&lt;&gt;</button></header>
    {htmlMode ? <textarea className="question-rich-html" value={value} required={required} spellCheck={false} onChange={(event) => onChange(event.target.value)} /> : <div ref={visualRef} className="question-rich-visual" contentEditable suppressContentEditableWarning role="textbox" aria-label={`Editor visual: ${label}`} aria-multiline="true" onInput={(event) => onChange(event.currentTarget.innerHTML)} />}
  </section>;
}
