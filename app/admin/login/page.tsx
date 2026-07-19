"use client";

import { useActionState } from "react";
import { entrarAdministrador, type AdminActionState } from "@/app/admin/actions";

const initialState: AdminActionState = { ok: false, message: "" };

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(entrarAdministrador, initialState);
  return <main className="admin-login-page"><form action={action} className="admin-login-card">
    <div className="admin-brand">🤖 LegisBot</div>
    <h1>Acesso administrativo</h1>
    <p>Entre com uma conta autorizada no Supabase Auth.</p>
    <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
    <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
    {state.message ? <div className="admin-alert error" role="alert">{state.message}</div> : null}
    <button className="admin-button primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
  </form></main>;
}
