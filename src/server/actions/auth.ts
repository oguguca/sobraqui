"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { passwordProblem } from "@/lib/password";
import { safeNextPath } from "@/lib/safe-redirect";
import { auth } from "@/server/better-auth";

export type AuthFormState = { error?: string; message?: string; email?: string };

const email = z.email("Informe um e-mail válido.").max(254);
const password = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

function apiStatus(err: unknown): number | null {
  return err instanceof APIError ? Number(err.statusCode) : null;
}

export async function signIn(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ email, password: z.string().min(1, "Informe a senha."), next: z.string().optional() })
    .safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") ?? undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(form.get("email") ?? "") };
  }
  try {
    await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
  } catch (err) {
    const status = apiStatus(err);
    return {
      error: status === 429 ? "Muitas tentativas. Aguarde alguns minutos." : "E-mail ou senha incorretos.",
      email: parsed.data.email,
    };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signUp(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (process.env.ALLOW_SIGNUP !== "true") return { error: "O cadastro está desativado." };
  const parsed = z
    .object({ email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] })
    .safeParse({ email: form.get("email"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, email: String(form.get("email") ?? "") };
  }
  try {
    await auth.api.signUpEmail({
      body: { email: parsed.data.email, password: parsed.data.password, name: parsed.data.email.split("@")[0] },
      headers: await headers(),
    });
  } catch (err) {
    const status = apiStatus(err);
    return {
      error: status === 429 ? "Muitas tentativas. Aguarde." : "Não foi possível criar a conta com esses dados.",
      email: parsed.data.email,
    };
  }
  redirect("/");
}

export async function requestPasswordReset(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data, redirectTo: "/redefinir-senha" },
      headers: await headers(),
    });
  } catch (err) {
    if (apiStatus(err) === 429) return { error: "Muitas tentativas. Aguarde alguns minutos." };
    console.error("[auth] falha ao pedir redefinição de senha");
  }
  // Mesma resposta exista ou não a conta, para não revelar e-mails cadastrados.
  return { message: "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha." };
}

export async function resetPassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ token: z.string().min(1), password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem." })
    .safeParse({ token: form.get("token"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await auth.api.resetPassword({ body: { token: parsed.data.token, newPassword: parsed.data.password } });
  } catch {
    return { error: "O link expirou ou já foi usado. Peça um novo." };
  }
  redirect("/login?senha=alterada");
}

export async function changePassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ current: z.string().min(1, "Informe a senha atual."), password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem." })
    .safeParse({ current: form.get("current"), password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await auth.api.changePassword({
      body: { currentPassword: parsed.data.current, newPassword: parsed.data.password, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch {
    return { error: "Senha atual incorreta." };
  }
  return { message: "Senha alterada. As outras sessões foram encerradas." };
}

export async function signOut(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
