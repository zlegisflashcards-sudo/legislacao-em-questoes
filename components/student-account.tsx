"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeReturnPath } from "@/lib/safe-return-path";

type PublicProfile = { id: string; nome_publico: string };
type Mode = "login" | "signup" | "forgot" | "profile" | "recover";

export function validatePublicName(value: string) {
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,48}[\p{L}\p{N}]$/u.test(value.trim());
}

export function StudentAccount() {
  const params = useSearchParams();
  const returnPath = safeReturnPath(params.get("retorno"));
  const initialMode: Mode = params.get("recuperar") === "1"
    ? "recover"
    : params.get("modo") === "cadastro" ? "signup" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setEmail(data.user.email ?? "");
        const result = await supabase.from("perfis_publicos").select("id,nome_publico").eq("id", data.user.id).maybeSingle();
        setProfile(result.data as PublicProfile | null);
        if (initialMode !== "recover") setMode("profile");
      }
      setLoading(false);
    }
    void load();
  }, [initialMode]);

  async function authenticate(formData: FormData) {
    setPending(true); setMessage("");
    const authEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (error) { setMessage("E-mail ou senha inválidos."); return; }
        window.location.assign(returnPath);
        return;
      }
      const publicName = String(formData.get("public_name") ?? "").trim();
      if (!validatePublicName(publicName)) {
        setMessage("Use um nome público de 3 a 50 caracteres, sem símbolos especiais."); return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${returnPath}`,
          data: { nome_publico: publicName },
        },
      });
      if (error) {
        setMessage("Não foi possível criar a conta. O e-mail ou nome público pode já estar em uso.");
        return;
      }
      if (data.session && data.user) {
        const profileResult = await supabase
          .from("perfis_publicos")
          .select("id,nome_publico")
          .eq("id", data.user.id)
          .maybeSingle();
        setEmail(data.user.email ?? authEmail);
        setProfile((profileResult.data as PublicProfile | null) ?? {
          id: data.user.id,
          nome_publico: publicName,
        });
        setMode("profile");
        setMessage("Conta criada com sucesso. Você já está conectado.");
        return;
      }
      setMessage("Conta criada. Confira seu e-mail para confirmar o cadastro.");
    } finally { setPending(false); }
  }

  async function sendRecovery(formData: FormData) {
    setPending(true); setMessage("");
    const authEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, {
      redirectTo: `${window.location.origin}/conta?recuperar=1`,
    });
    setMessage(error ? "Não foi possível enviar o link agora." : "Se o e-mail estiver cadastrado, você receberá um link de recuperação.");
    setPending(false);
  }

  async function updatePassword(formData: FormData) {
    setPending(true); setMessage("");
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password.length < 8 || password !== confirmation) {
      setMessage("As senhas devem coincidir e ter pelo menos 8 caracteres."); setPending(false); return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? "O link expirou ou não foi possível alterar a senha." : "Senha alterada. Você já pode continuar.");
    setPending(false);
  }

  async function saveProfile(formData: FormData) {
    if (!profile) return;
    const publicName = String(formData.get("public_name") ?? "").trim();
    if (!validatePublicName(publicName)) { setMessage("Revise o nome público."); return; }
    setPending(true);
    const { error } = await supabase.from("perfis_publicos").update({ nome_publico: publicName }).eq("id", profile.id);
    if (!error) setProfile({ ...profile, nome_publico: publicName });
    setMessage(error ? "Não foi possível salvar. Esse nome pode já estar em uso." : "Perfil atualizado.");
    setPending(false);
  }

  if (loading) return <p className="text-slate-600">Carregando sua conta…</p>;

  if (mode === "recover") return <AccountCard title="Definir nova senha" description="Escolha uma nova senha para sua conta."><form action={updatePassword} className="space-y-4"><Field label="Nova senha" name="password" type="password" minLength={8} /><Field label="Confirmar senha" name="confirmation" type="password" minLength={8} /><PrimaryButton pending={pending}>Salvar nova senha</PrimaryButton>{message ? <Status>{message}</Status> : null}</form></AccountCard>;

  if (mode === "profile" && profile) return <AccountCard title="Seu perfil na comunidade" description="Somente o nome público aparece nos comentários. Seu e-mail nunca é exibido publicamente."><form action={saveProfile} className="space-y-4"><Field label="Nome público" name="public_name" defaultValue={profile.nome_publico} /><p className="text-sm text-slate-500">E-mail da conta: {email}</p><div className="flex flex-wrap gap-3"><PrimaryButton pending={pending}>Salvar perfil</PrimaryButton><button type="button" onClick={() => void supabase.auth.signOut().then(() => window.location.reload())} className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700">Sair</button></div>{message ? <Status>{message}</Status> : null}</form></AccountCard>;

  if (mode === "forgot") return <AccountCard title="Recuperar senha" description="Enviaremos um link seguro para o e-mail cadastrado."><form action={sendRecovery} className="space-y-4"><Field label="E-mail" name="email" type="email" /><PrimaryButton pending={pending}>Enviar link de recuperação</PrimaryButton>{message ? <Status>{message}</Status> : null}</form><button type="button" onClick={() => { setMode("login"); setMessage(""); }} className="mt-5 font-bold text-blue-700 hover:underline">← Voltar ao login</button></AccountCard>;

  return <AccountCard title={mode === "signup" ? "Criar conta" : "Entrar na comunidade"} description="Participe das discussões sem expor seu e-mail."><form action={authenticate} className="space-y-4">{mode === "signup" ? <Field label="Nome público" name="public_name" placeholder="Ex.: Maria Concursos" /> : null}<Field label="E-mail" name="email" type="email" /><Field label="Senha" name="password" type="password" minLength={8} /><PrimaryButton pending={pending}>{mode === "signup" ? "Criar conta" : "Entrar"}</PrimaryButton>{message ? <Status>{message}</Status> : null}</form><div className="mt-5 flex flex-wrap gap-5 text-sm"><button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }} className="font-bold text-blue-700 hover:underline">{mode === "login" ? "Criar uma conta" : "Já tenho uma conta"}</button>{mode === "login" ? <button type="button" onClick={() => { setMode("forgot"); setMessage(""); }} className="font-bold text-slate-600 hover:text-blue-700 hover:underline">Esqueci minha senha</button> : null}</div></AccountCard>;
}

function AccountCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="space-y-6"><div><h1 className="text-3xl font-black text-[#062a5f]">{title}</h1><p className="mt-2 text-slate-600">{description}</p></div><div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">{children}</div></div>;
}

function Field({ label, name, type = "text", minLength, defaultValue, placeholder }: { label: string; name: string; type?: string; minLength?: number; defaultValue?: string; placeholder?: string }) {
  return <label className="block text-sm font-bold text-slate-700">{label}<input name={name} type={type} minLength={minLength} defaultValue={defaultValue} placeholder={placeholder} autoComplete={type === "password" ? "current-password" : undefined} required className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200" /></label>;
}

function PrimaryButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <button disabled={pending} className="rounded-xl bg-blue-700 px-5 py-3 font-black text-white disabled:opacity-60">{pending ? "Aguarde…" : children}</button>;
}

function Status({ children }: { children: React.ReactNode }) { return <p role="status" className="text-sm font-bold text-blue-700">{children}</p>; }
