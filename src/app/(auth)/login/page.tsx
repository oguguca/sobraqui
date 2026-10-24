import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const linkError = params.erro === "link" ? "O link é inválido ou expirou. Tente de novo." : undefined;
  const signupEnabled = process.env.ALLOW_SIGNUP === "true";

  return (
    <AuthForm
      title="Entrar"
      description="Acesse suas finanças."
      submitLabel="Entrar"
      action={signIn}
      hidden={{ next }}
      initialError={linkError}
      fields={[
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        { name: "password", label: "Senha", type: "password", autoComplete: "current-password" },
      ]}
      footer={
        <div className="grid gap-2">
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
