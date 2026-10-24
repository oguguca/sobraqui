import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { Brand } from "@/components/brand";
import { updatePassword } from "@/server/actions/auth";
import { requireAuth } from "@/server/auth";

export const metadata: Metadata = { title: "Nova senha" };

// Fora do layout do app: chega aqui pelo link de recuperação, já com sessão.
export default async function ResetPasswordPage() {
  await requireAuth();
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Brand className="mb-8 justify-center" />
        <AuthForm
          title="Criar nova senha"
          submitLabel="Salvar senha"
          action={updatePassword}
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
      </div>
    </main>
  );
}
