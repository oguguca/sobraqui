"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { errorMessage, type ActionResult } from "@/server/action";
import { getAuth } from "@/server/auth";
import { resetAllData } from "@/server/reset";

/** Zera todos os dados financeiros (pede a palavra ZERAR como confirmação). */
export async function resetEverything(input: unknown): Promise<ActionResult<{ transactions: number }>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  if (!z.object({ confirm: z.literal("ZERAR") }).safeParse(input).success) {
    return { ok: false, error: "Digite ZERAR para confirmar." };
  }
  try {
    const result = await resetAllData(auth);
    refresh();
    return { ok: true, data: result, message: "Tudo zerado. Você pode começar do zero." };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
