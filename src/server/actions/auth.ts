"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { publicEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthFormState = { error?: string; message?: string; email?: string };

const email = z.email("Informe um e-mail válido.").max(254);
// Espelha supabase/config.toml (mínimo 10, maiúscula, minúscula e número).
const password = z
  .string()
  .min(10, "Use pelo menos 10 caracteres.")
  .max(72, "Use até 72 caracteres.")
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/\d/, "Inclua um número.");

export async function signIn(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Informe a senha."), next: z.string().optional() })
    .safeParse({
      email: form.get("email"),
      password: form.get("password"),
      next: form.get("next") ?? undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(form.get("email") ?? "") };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Confirme seu e-mail antes de entrar."
        : error.status === 429
          ? "Muitas tentativas. Aguarde alguns minutos."
          : "E-mail ou senha incorretos.";
    return { error: message, email: parsed.data.email };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (process.env.ALLOW_SIGNUP !== "true") {
    return { error: "O cadastro está desativado." };
  }
  const parsed = z
    .object({ email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] })
    .safeParse({ email: form.get("email"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(form.get("email") ?? "") };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) {
    return {
      error: error.code === "weak_password" ? "Senha fraca. Escolha outra." : "Não foi possível criar a conta.",
      email: parsed.data.email,
    };
  }
  if (data.session) redirect("/");
  return { message: "Enviamos um link de confirmação para o seu e-mail." };
}

export async function requestPasswordReset(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/redefinir-senha`,
  });
  // Mesma resposta exista ou não a conta, para não revelar e-mails cadastrados.
  return { message: "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha." };
}

export async function updatePassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "O link expirou. Peça um novo." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "A nova senha precisa ser diferente da atual."
          : error.code === "reauthentication_needed"
            ? "Por segurança, entre novamente antes de trocar a senha."
            : "Não foi possível alterar a senha.",
    };
  }
  redirect("/?senha=alterada");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
