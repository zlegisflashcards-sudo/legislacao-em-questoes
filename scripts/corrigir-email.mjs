import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = "8f2d2972-adc4-4516-9208-c7fac9cf35ce";

const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
  "8f2d2972-adc4-4516-9208-c7fac9cf35ce",
  {
    email: "jhemersonestudos@gmail.com",
    email_confirm: true,
  }
);

if (error) {
  console.error("Erro:", error);
  process.exit(1);
}

console.log("E-mail alterado com sucesso!");
console.log("UID:", data.user.id);
console.log("Novo e-mail:", data.user.email);