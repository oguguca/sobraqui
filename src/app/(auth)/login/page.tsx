import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { GoogleButton } from "@/components/auth/google-button";
import { safeNextPath } from "@/lib/safe-redirect";
import { signIn } from "@/server/actions/auth";
import { isGoogleEnabled } from "@/server/better-auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const passwordChanged = params.senha === "alterada" ? "Senha alterada. Entre com a nova senha." : undefined;
  const googleError =
    params.erro === "google" ? "Não foi possível entrar com o Google. Use a conta cadastrada aqui." : undefined;
  const signupEnabled = process.env.ALLOW_SIGNUP === "true";

  return (
    <AuthForm
      title="Entrar"
      description="Acesse suas finanças."
      submitLabel="Entrar"
      action={signIn}
      hidden={{ next }}
      initialMessage={passwordChanged}
      initialError={googleError}
      fields={[
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <div className="grid gap-2">
          {isGoogleEnabled() && (
            <div className="mb-2 grid gap-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
              </div>
              <GoogleButton next={safeNextPath(next)} />
            </div>
          )}
          <Link href="/recuperar-senha" className="underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
          {signupEnabled && (
            <span>
              Primeira vez?{" "}
              <Link href="/cadastro" className="font-medium text-foreground underline-offset-4 hover:underline">
                Criar conta
              </Link>
            </span>
          )}
        </div>
      }
    />
  );
}
