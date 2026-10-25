import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { DEFAULT_TIMEZONE } from "@/domain/dates";
import { auth } from "@/server/better-auth";
import { withUser, type Tx } from "@/server/db";

export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string;
};

export type AuthContext = {
  user: SessionUser;
  /** Executa consultas com o RLS do usuário (ver withUser). */
  db: <T>(fn: (tx: Tx) => Promise<T>, options?: { timeoutMs?: number }) => Promise<T>;
};

/** Usuário da requisição, com a sessão validada no banco. Memorizado por requisição. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const userId = session.user.id;
  const db: AuthContext["db"] = (fn, options) => withUser(userId, fn, options);
  const profile = await db((tx) =>
    tx.profile.findUnique({ where: { id: userId }, select: { display_name: true, timezone: true } }),
  );
  return {
    db,
    user: {
      id: userId,
      email: session.user.email ?? null,
      displayName: profile?.display_name ?? null,
      timezone: profile?.timezone ?? DEFAULT_TIMEZONE,
    },
  };
});

/** Para páginas: sem sessão, vai para o login. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  return ctx;
}
