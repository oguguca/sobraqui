import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "@/server/actions/auth";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  // Lê ALLOW_SIGNUP em tempo de execução, não no build.
  await connection();
  // Uso pessoal: o cadastro só existe enquanto ALLOW_SIGNUP=true.
  if (process.env.ALLOW_SIGNUP !== "true") notFound();

  return (
    <AuthForm
      title="Criar conta"
      submitLabel="Criar conta"
      action={signUp}
      fields={[
        { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
        {
          name: "password",
          label: "Senha",
          type: "password",
          autoComplete: "new-password",
          hint: "Mínimo de 10 caracteres, com maiúscula, minúscula e número.",
        },
        { name: "confirm", label: "Confirme a senha", type: "password", autoComplete: "new-password" },
      ]}
      footer={
        <Link href="/login" className="underline-offset-4 hover:underline">
          Já tenho conta
        </Link>
      }
    />
  );
}
