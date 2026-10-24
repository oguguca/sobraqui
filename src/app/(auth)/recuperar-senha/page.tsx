import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordReset } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPasswordPage() {
  return (
    <AuthForm
      title="Recuperar senha"
      description="Enviaremos um link para você criar uma nova senha."
      submitLabel="Enviar link"
      action={requestPasswordReset}
      fields={[{ name: "email", label: "E-mail", type: "email", autoComplete: "email" }]}
      footer={
        <Link href="/login" className="underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      }
    />
  );
}
