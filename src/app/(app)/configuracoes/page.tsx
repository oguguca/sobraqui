import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { CategoriesSection } from "@/components/categories/categories-section";
import { ProfileForm } from "@/components/settings/profile-form";
import { ResetEverything } from "@/components/settings/reset-everything";
import { PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { changePassword } from "@/server/actions/auth";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/queries/core";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: PageProps<"/configuracoes">) {
  const ctx = await requireAuth();
  const { user } = ctx;
  const showArchived = (await searchParams).arquivadas === "1";
  const categories = await listCategories(ctx, { includeArchived: showArchived });
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Preferências</CardTitle>
            <CardDescription>Moeda: real (R$). Datas no formato brasileiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm displayName={user.displayName} timezone={user.timezone} />
          </CardContent>
        </Card>
        <CategoriesSection categories={categories} showArchived={showArchived} />
        <Card>
          <CardHeader>
            <CardTitle>Segurança</CardTitle>
            <CardDescription>Conectado como {user.email ?? "—"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-md">
              <AuthForm
                bare
                title="Trocar senha"
                submitLabel="Trocar senha"
                action={changePassword}
                fields={[
                  { name: "current", label: "Senha atual", type: "password", autoComplete: "current-password" },
                  {
                    name: "password",
                    label: "Nova senha",
                    type: "password",
                    autoComplete: "new-password",
                    hint: "Mínimo de 10 caracteres, com maiúscula, minúscula e número.",
                  },
                  { name: "confirm", label: "Confirme a nova senha", type: "password", autoComplete: "new-password" },
                ]}
              />
            </div>
          </CardContent>
        </Card>
        <ResetEverything />
      </div>
    </>
  );
}
