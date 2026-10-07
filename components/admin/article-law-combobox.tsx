"use client";

import { useMemo, useState } from "react";

type Law = { slug: string; title: string; code: string | null };

const label = (law: Law) => `${law.code ? `${law.code} — ` : ""}${law.title}`;

export function ArticleLawCombobox({ laws, value }: { laws: Law[]; value: string }) {
  const selected = laws.find((law) => law.slug.toLowerCase() === value.toLowerCase());
  const [query, setQuery] = useState(selected ? label(selected) : "");
  const [selectedSlug, setSelectedSlug] = useState(selected?.slug.toLowerCase() ?? "");
  const [open, setOpen] = useState(false);
  const choices = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return laws.slice(0, 30);
    return laws.filter((law) => `${law.slug} ${law.code ?? ""} ${law.title}`.toLocaleLowerCase("pt-BR").includes(needle)).slice(0, 30);
  }, [laws, query]);
  const choose = (law: Law | null) => {
    setSelectedSlug(law?.slug.toLowerCase() ?? "");
    setQuery(law ? label(law) : "");
    setOpen(false);
  };

  return <label className="article-law-combobox">Lei
    <input type="hidden" name="lei" value={selectedSlug}/>
    <input aria-autocomplete="list" aria-expanded={open} autoComplete="off" value={query} placeholder="Pesquisar lei por código, slug ou título" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setSelectedSlug(""); setOpen(true); }}/>
    {open ? <div className="article-law-combobox-menu" role="listbox"><button type="button" role="option" aria-selected={!selectedSlug} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(null)}>Todas as leis</button>{choices.map((law) => <button type="button" role="option" aria-selected={selectedSlug === law.slug.toLowerCase()} key={law.slug} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(law)}><strong>{law.code ?? law.slug}</strong><span>{law.title}</span></button>)}{choices.length === 0 ? <p>Nenhuma lei encontrada.</p> : null}</div> : null}
  </label>;
}
