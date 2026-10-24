import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { DEFAULT_TIMEZONE } from "@/domain/dates";
import { createSupabaseServerClient, type AppSupabaseClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string;
};

export type AuthContext = { user: SessionUser; supabase: AppSupabaseClient };

/**
 * Usuário da requisição, com o JWT validado pelo Supabase (getClaims verifica
 * assinatura e expiração). Memorizado por requisição.
 */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("id", claims.sub)
    .maybeSingle();

  return {
    supabase,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      displayName: profile?.display_name ?? null,
      timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    },
  };
});

/** Para páginas: sem sessão, vai para o login. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}
