"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminPublicShortcut from "@/components/admin/admin-public-shortcut";
import { supabase } from "@/lib/supabase";
import { siteConfig } from "@/lib/site-config";
import { headerActions, headerNavigation, type SiteNavigationItem } from "@/lib/site-navigation";

function WhatsAppIcon() {
  return <svg aria-hidden="true" viewBox="0 0 32 32" className="h-5 w-5 shrink-0" fill="currentColor"><path d="M16.04 3.2A12.74 12.74 0 0 0 5.12 22.5L3.5 28.8l6.45-1.68A12.74 12.74 0 1 0 16.04 3.2Zm0 2.28a10.46 10.46 0 0 1 8.85 16.03 10.46 10.46 0 0 1-13.98 3.36l-.46-.28-3.84 1 1.02-3.74-.3-.48a10.46 10.46 0 0 1 8.71-15.89Zm-4.45 5.58c-.24 0-.62.09-.95.45-.33.36-1.25 1.22-1.25 2.98 0 1.75 1.28 3.45 1.46 3.68.18.24 2.47 3.95 6.1 5.38 3.02 1.19 3.64.95 4.3.89.66-.06 2.12-.86 2.42-1.7.3-.83.3-1.54.21-1.7-.09-.15-.33-.24-.69-.42-.36-.18-2.12-1.04-2.45-1.16-.33-.12-.57-.18-.81.18-.24.36-.93 1.16-1.14 1.4-.21.24-.42.27-.78.09-.36-.18-1.52-.56-2.9-1.78-1.07-.95-1.79-2.13-2-2.49-.21-.36-.02-.55.16-.73.16-.16.36-.42.54-.63.18-.21.24-.36.36-.6.12-.24.06-.45-.03-.63-.09-.18-.81-1.95-1.11-2.67-.29-.7-.58-.6-.81-.61h-.63Z" /></svg>;
}

function NavigationLink({ item, onSelect }: { item: SiteNavigationItem; onSelect?: () => void }) {
  const className = "rounded-lg px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300";
  return item.external
    ? <a href={item.href} target="_blank" rel="noreferrer" onClick={onSelect} className={className}>{item.label}</a>
    : <Link href={item.href} onClick={onSelect} className={className}>{item.label}</Link>;
}

export function SiteHeader() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setAuthenticated(Boolean(data.user));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const navigation = headerNavigation(authenticated);
  const actions = headerActions(authenticated);
  const closeMenu = () => setMenuOpen(false);

  return <header className="border-b border-blue-300/15 bg-[#07172d] text-white shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="flex min-h-20 items-center justify-between gap-4">
        <Link href="/" className="inline-flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300" aria-label="Legislação para Concursos — página inicial">
          <img src="/logo-legis.png" alt="" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
          <span className="truncate text-base font-black tracking-tight sm:text-xl">Legislação para Concursos</span>
        </Link>

        <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
          {navigation.map((item) => <NavigationLink key={item.label} item={item} />)}
          <AdminPublicShortcut variant="panel" />
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <a href={siteConfig.links.whatsapp} target="_blank" rel="noreferrer" aria-label="Falar com a LegisFlashcards pelo WhatsApp" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-200"><WhatsAppIcon /><span className="hidden xl:inline">WhatsApp</span></a>
          {actions.map((item) => <Link key={item.label} href={item.href} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">{item.label}</Link>)}
        </div>

        <button type="button" aria-label={menuOpen ? "Fechar menu principal" : "Abrir menu principal"} aria-expanded={menuOpen} aria-controls="mobile-site-navigation" onClick={() => setMenuOpen((open) => !open)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-200/30 text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 lg:hidden"><span aria-hidden="true">{menuOpen ? "×" : "☰"}</span></button>
      </div>

      {menuOpen ? <nav id="mobile-site-navigation" aria-label="Navegação principal no celular" className="grid gap-1 border-t border-white/10 py-4 lg:hidden">
        {navigation.map((item) => <NavigationLink key={item.label} item={item} onSelect={closeMenu} />)}
        <AdminPublicShortcut variant="panel" />
        <a href={siteConfig.links.whatsapp} target="_blank" rel="noreferrer" onClick={closeMenu} aria-label="Falar com a LegisFlashcards pelo WhatsApp" className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-200"><WhatsAppIcon />WhatsApp</a>
        {actions.map((item) => <Link key={item.label} href={item.href} onClick={closeMenu} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">{item.label}</Link>)}
      </nav> : null}
    </div>
  </header>;
}
