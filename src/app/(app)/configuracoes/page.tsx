import type { Metadata } from "next";
import Link from "next/link";

import { ProfileForm } from "@/components/settings/profile-form";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/server/auth";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const { user } = await requireAuth();
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
        <Card>
          <CardHeader>
            <CardTitle>Segurança</CardTitle>
            <CardDescription>Conectado como {user.email ?? "—"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/redefinir-senha">Trocar senha</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
