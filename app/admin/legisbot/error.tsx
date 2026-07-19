"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="admin-shell"><div className="admin-empty"><h2>Não foi possível consultar o Supabase</h2><p>Tente novamente em alguns instantes.</p><button className="admin-button primary" onClick={reset}>Tentar novamente</button></div></main>;
}
