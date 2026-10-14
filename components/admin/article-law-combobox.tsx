"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Law = { slug: string; title: string; code: string | null };

const label = (law: Law) => `${law.code ? `${law.code} — ` : ""}${law.title}`;
const FIXED_LAW_KEY = "legisflashcards:admin:artigos:lei";

export function ArticleLawCombobox({ laws, value }: { laws: Law[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = laws.find((law) => law.slug.toLowerCase() === value.toLowerCase());
  const [query, setQuery] = useState(selected ? label(selected) : "");
  const [selectedSlug, setSelectedSlug] = useState(selected?.slug.toLowerCase() ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const current = laws.find((law) => law.slug.toLowerCase() === value.toLowerCase());
    setSelectedSlug(current?.slug.toLowerCase() ?? "");
    if (!open) setQuery(current ? label(current) : "");
  }, [laws, open, value]);
  useEffect(() => {
    if (value) {
      localStorage.setItem(FIXED_LAW_KEY, value.toLowerCase());
      return;
    }
    const saved = localStorage.getItem(FIXED_LAW_KEY)?.toLowerCase();
    if (!saved || !laws.some((law) => law.slug.toLowerCase() === saved)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("lei", saved);
    router.replace(`${pathname}?${params.toString()}`);
  }, [laws, pathname, router, searchParams, value]);
  const choices = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return laws.slice(0, 30);
    return laws.filter((law) => `${law.slug} ${law.code ?? ""} ${law.title}`.toLocaleLowerCase("pt-BR").includes(needle)).slice(0, 30);
  }, [laws, query]);
  const choose = (law: Law | null) => {
    setSelectedSlug(law?.slug.toLowerCase() ?? "");
    setQuery(law ? label(law) : "");
    if (law) localStorage.setItem(FIXED_LAW_KEY, law.slug.toLowerCase());
    else localStorage.removeItem(FIXED_LAW_KEY);
    setOpen(false);
  };

  const removeFixedLaw = () => {
    localStorage.removeItem(FIXED_LAW_KEY);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lei");
    params.delete("law");
    router.replace(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  };

  return <label className="article-law-combobox">Lei
    <input type="hidden" name="lei" value={selectedSlug}/>
    <input aria-autocomplete="list" aria-expanded={open} autoComplete="off" value={query} placeholder="Pesquisar lei por código, slug ou título" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setSelectedSlug(""); setOpen(true); }}/>
    {selectedSlug ? <button type="button" className="article-law-clear" onClick={removeFixedLaw}>Retirar lei fixada</button> : null}
    {open ? <div className="article-law-combobox-menu" role="listbox"><button type="button" role="option" aria-selected={!selectedSlug} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(null)}>Todas as leis</button>{choices.map((law) => <button type="button" role="option" aria-selected={selectedSlug === law.slug.toLowerCase()} key={law.slug} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(law)}><strong>{law.code ?? law.slug}</strong><span>{law.title}</span></button>)}{choices.length === 0 ? <p>Nenhuma lei encontrada.</p> : null}</div> : null}
  </label>;
}
