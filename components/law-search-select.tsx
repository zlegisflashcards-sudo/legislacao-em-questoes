"use client";

import { useEffect, useMemo, useState } from "react";

export type LawSearchOption = { id: string | number; titulo?: string | null; nome?: string | null; slug?: string | null; codigo?: string | null; numero?: string | null };

function label(option: LawSearchOption) {
  return String(option.titulo || option.nome || option.slug || option.id);
}

function searchText(option: LawSearchOption) {
  return [option.titulo, option.nome, option.slug, option.codigo, option.numero, option.id].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function LawSearchSelect({ options, value, onChange, name, placeholder = "Pesquisar lei…", emptyLabel = "Selecione uma lei", disabled = false, className = "" }: { options: LawSearchOption[]; value: string; onChange: (value: string) => void; name?: string; placeholder?: string; emptyLabel?: string; disabled?: boolean; className?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((option) => String(option.id) === value) ?? null, [options, value]);
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
  const matches = useMemo(() => normalized ? options.filter((option) => searchText(option).includes(normalized)) : options, [normalized, options]);
  useEffect(() => { if (selected && !open) setQuery(label(selected)); }, [selected, open]);
  return <div className={`relative min-w-0 ${className}`}>
    {name ? <input type="hidden" name={name} value={value} /> : null}
    <input type="search" role="combobox" value={query} disabled={disabled} placeholder={placeholder} aria-label={emptyLabel} aria-expanded={open} aria-controls={name ? `${name}-law-options` : undefined} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (selected && event.target.value !== label(selected)) onChange(""); }} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 pr-9" />
    {value ? <button type="button" aria-label="Limpar lei selecionada" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); setQuery(""); setOpen(true); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800">×</button> : null}
    {open ? <div id={name ? `${name}-law-options` : undefined} role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">{matches.length ? matches.map((option) => <button key={String(option.id)} type="button" role="option" aria-selected={String(option.id) === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(String(option.id)); setQuery(label(option)); setOpen(false); }} className="block w-full rounded-md px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50">{label(option)}{option.slug ? <small className="ml-2 text-slate-500">{option.slug}</small> : null}</button>) : <p className="px-3 py-2 text-sm text-slate-500">Nenhuma lei encontrada.</p>}</div> : null}
  </div>;
}
