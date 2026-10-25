import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resetPassword } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Nova senha" };

// Destino do link de recuperação: o Better Auth valida o token e redireciona
// para cá com ?token=... (ou ?error=INVALID_TOKEN).
export default async function ResetPasswordPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  if (!token || params.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          O link é inválido ou expirou.{" "}
          <Link href="/recuperar-senha" className="font-medium underline">
            Peça um novo
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <AuthForm
      title="Criar nova senha"
      submitLabel="Salvar senha"
      action={resetPassword}
      hidden={{ token }}
      fields={[
        {
          name: "password",
          label: "Nova senha",
          type: "password",
          autoComplete: "new-password",
          hint: "Mínimo de 10 caracteres, com maiúscula, minúscula e número.",
        },
        { name: "confirm", label: "Confirme a senha", type: "password", autoComplete: "new-password" },
      ]}
    />
  );
}
