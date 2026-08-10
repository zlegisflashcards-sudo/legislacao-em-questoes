import { NextResponse } from "next/server";
import { hasNormalizedEmail, normalizeStudentEmail } from "@/lib/public-signup-preflight";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authEmailExists(email: string) {
  const supabase = getSupabaseServerClient();
  for (let page = 1; page <= 100; page += 1) {
    const users = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (users.error) throw new Error("Não foi possível verificar a conta existente.");
    if (hasNormalizedEmail(users.data.users, email)) return true;
    if (users.data.users.length < 1000) return false;
  }
  throw new Error("Não foi possível verificar a conta existente.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown };
    const email = normalizeStudentEmail(typeof body.email === "string" ? body.email : "");
    if (!emailPattern.test(email)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });

    const supabase = getSupabaseServerClient();
    const students = await supabase.from("alunos").select("id,email,user_id").ilike("email", `%${email}%`);
    if (students.error) throw new Error("Não foi possível verificar o aluno existente.");
    const student = (students.data ?? []).find((item) => normalizeStudentEmail(item.email ?? "") === email);
    const authExists = await authEmailExists(email);
    // A student without Auth must be able to activate the existing student record.
    const exists = authExists || Boolean(student?.user_id);
    return NextResponse.json({ exists, activation: Boolean(student && !exists) });
  } catch {
    return NextResponse.json({ error: "Não foi possível verificar este e-mail agora." }, { status: 503 });
  }
}
