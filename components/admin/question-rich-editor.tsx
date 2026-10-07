"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

function normalizedText(value: string) {
  const container = document.createElement("div");
  container.innerHTML = value;
  return (container.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function restoreSourceStyles(source: Element, current: Element) {
  if (current.getAttribute("style")?.includes("--tw-")) {
    const sourceStyle = source.getAttribute("style");
    if (sourceStyle) current.setAttribute("style", sourceStyle);
    else current.removeAttribute("style");
  }

  const sourceChildren = Array.from(source.children);
  const currentChildren = Array.from(current.children);
  for (let index = 0; index < Math.min(sourceChildren.length, currentChildren.length); index += 1) {
    if (sourceChildren[index].tagName === currentChildren[index].tagName) {
      restoreSourceStyles(sourceChildren[index], currentChildren[index]);
    }
  }
}

function editorHtmlValue(editor: HTMLDivElement, persistedValue: string) {
  // Extensões do navegador podem inserir variáveis de estilo Tailwind no DOM
  // editável. Se o texto não mudou, mantenha literalmente o HTML persistido.
  if (normalizedText(editor.innerHTML) === normalizedText(persistedValue)) return persistedValue;

  const source = document.createElement("div");
  source.innerHTML = persistedValue;
  const copy = editor.cloneNode(true) as HTMLDivElement;
  restoreSourceStyles(source, copy);
  return copy.innerHTML;
}

/**
 * Editor leve para HTML já persistido nas questões. Não sanitiza nem reserializa
 * o valor ao abrir ou salvar sem edição; o player continua sendo responsável pela
 * sanitização de exibição ao aluno.
 */
export function QuestionRichEditor({ label, value, onChange, required = false, disabled = false }: Props) {
  const [htmlMode, setHtmlMode] = useState(false);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!htmlMode && visualRef.current && visualRef.current.innerHTML !== value) {
      visualRef.current.innerHTML = value;
    }
  }, [htmlMode, value]);

  function toggleMode() {
    if (!htmlMode && visualRef.current) onChange(editorHtmlValue(visualRef.current, value));
    setHtmlMode((current) => !current);
  }

  return <section className="question-rich-field">
    <header><label>{label}{required ? " *" : ""}</label><button type="button" disabled={disabled} onClick={toggleMode} aria-label={`Alternar ${label} entre visual e HTML`} title="Alternar visual/HTML">&lt;&gt;</button></header>
    {htmlMode ? <textarea className="question-rich-html" value={value} required={required} disabled={disabled} spellCheck={false} onChange={(event) => onChange(event.target.value)} /> : <div ref={visualRef} className="question-rich-visual" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label={`Editor visual: ${label}`} aria-multiline="true" onInput={(event) => onChange(editorHtmlValue(event.currentTarget, value))} />}
  </section>;
}
