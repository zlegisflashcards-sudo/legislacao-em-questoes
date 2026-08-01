"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function LegiscastHeader() {
  const [authenticated, setAuthenticated] = useState(false);

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

  return (
    <header className="border-b border-blue-300/15 bg-[#07172d]/95 text-white shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <a
          href="/legiscast"
          className="inline-flex w-fit items-center gap-3 rounded-lg font-black tracking-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-300"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 shrink-0 text-[#28b7ff]"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
          </svg>
          <span className="text-xl sm:text-2xl">LegisCast TV</span>
        </a>

        <nav
          aria-label="Navegação do LegisCast TV"
          className="grid grid-cols-3 gap-2 text-sm font-bold sm:flex sm:flex-wrap sm:items-center"
        >
          <a href="/" className="rounded-lg px-3 py-2 text-center text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300">
            Catálogo
          </a>
          <a href="/ranking-legis" className="rounded-lg px-3 py-2 text-center text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300">
            Liga das Leis
          </a>
          <a href="/conta" className="rounded-lg bg-blue-600 px-3 py-2 text-center text-white transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">
            {authenticated ? "Meu perfil" : "Entrar"}
          </a>
        </nav>
      </div>
    </header>
  );
}
