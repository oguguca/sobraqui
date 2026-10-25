"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { diffDays } from "@/domain/dates";
import { isoDate } from "@/lib/validation";
import { createCardFromPluggy, syncOpenFinance, type SyncReport } from "@/server/open-finance-sync";
import { errorMessage, type ActionResult } from "@/server/action";
import { getAuth } from "@/server/auth";
import {
  buildImportPreview,
  clearImportedData,
  commitImport,
  decisionsSchema,
  importOptionsSchema,
  readUpload,
  reconcileWithBankBalance,
  sourceFromPluggy,
  sourceFromUpload,
  undoImportBatch,
  type ImportReport,
  type PreviewResult,
} from "@/server/import-service";
import {
  getPluggyAccount,
  isPluggyConfigured,
  listPluggyAccounts,
  type PluggyAccount,
} from "@/server/pluggy";

// Ações com arquivo recebem FormData; por isso não usam authedAction (JSON).

function parseJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const SESSION_EXPIRED = { ok: false as const, error: "Sua sessão expirou. Entre novamente." };

export async function previewImport(form: FormData): Promise<ActionResult<PreviewResult>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const options = importOptionsSchema.safeParse(parseJson(form.get("options")));
  if (!options.success) return { ok: false, error: options.error.issues[0]?.message ?? "Opções inválidas." };
  try {
    const source = sourceFromUpload(await readUpload(form.get("file")), options.data);
    if ("kind" in source) return { ok: true, data: source };
    return { ok: true, data: await buildImportPreview(auth, source, options.data) };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function confirmImport(form: FormData): Promise<ActionResult<ImportReport>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const options = importOptionsSchema.safeParse(parseJson(form.get("options")));
  const decisions = decisionsSchema.safeParse(parseJson(form.get("decisions")));
  if (!options.success) return { ok: false, error: options.error.issues[0]?.message ?? "Opções inválidas." };
  if (!decisions.success) return { ok: false, error: "Revisão inválida. Analise o arquivo de novo." };
  try {
    const source = sourceFromUpload(await readUpload(form.get("file")), options.data);
    if ("kind" in source) return { ok: false, error: "Configure o mapeamento de colunas antes de importar." };
    const report = await commitImport(auth, source, options.data, decisions.data);
    refresh();
    return { ok: true, data: report, message: `${report.imported} transação(ões) importada(s).` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function undoImport(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Importação inválida." };
  try {
    const result = await undoImportBatch(auth, parsed.data.id);
    refresh();
    return { ok: true, data: result, message: `Importação desfeita: ${result.removed} transação(ões) removida(s).` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Open Finance (Pluggy)
// ---------------------------------------------------------------------------

export type OpenFinanceAccount = Pick<PluggyAccount, "id" | "type" | "subtype" | "name" | "marketingName" | "number" | "balance">;

export async function listOpenFinanceAccounts(): Promise<ActionResult<OpenFinanceAccount[]>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  if (!isPluggyConfigured()) return { ok: false, error: "Open Finance não configurado." };
  try {
    const accounts = await listPluggyAccounts();
    return {
      ok: true,
      data: accounts.map(({ id, type, subtype, name, marketingName, number, balance }) => ({
        id,
        type,
        subtype,
        name,
        marketingName,
        number,
        balance,
      })),
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

const openFinanceSchema = z
  .object({
    pluggyAccountId: z.uuid("Escolha a conta do Open Finance."),
    from: isoDate,
    to: isoDate,
    options: importOptionsSchema,
  })
  .refine((v) => v.from <= v.to && diffDays(v.from, v.to) <= 366, {
    message: "Escolha um período de até 1 ano.",
  });

export async function previewOpenFinance(input: unknown): Promise<ActionResult<PreviewResult>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = openFinanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    const { pluggyAccountId, from, to, options } = parsed.data;
    const source = await sourceFromPluggy(pluggyAccountId, from, to);
    return { ok: true, data: await buildImportPreview(auth, source, options) };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function confirmOpenFinance(input: unknown): Promise<ActionResult<ImportReport>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = openFinanceSchema.safeParse(input);
  const decisions = decisionsSchema.safeParse((input as { decisions?: unknown } | null)?.decisions);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (!decisions.success) return { ok: false, error: "Revisão inválida. Busque as transações de novo." };
  try {
    const { pluggyAccountId, from, to, options } = parsed.data;
    const source = await sourceFromPluggy(pluggyAccountId, from, to);
    const report = await commitImport(auth, source, options, decisions.data);
    if (options.target === "account") {
      const account = await getPluggyAccount(pluggyAccountId);
      await reconcileWithBankBalance(auth, options.targetId, Math.round(account.balance * 100));
    }
    refresh();
    return { ok: true, data: report, message: `${report.imported} transação(ões) sincronizada(s). Saldo ajustado ao do banco.` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}


export type SyncAllReport = SyncReport;

const syncAllSchema = z.object({
  /** Conta/cartão do Open Finance -> conta/cartão do Sobraqui. */
  targets: z.record(z.uuid(), z.uuid()),
  /** Desfaz as sincronizações anteriores e importa tudo de novo. */
  rebuild: z.boolean().default(false),
});

/** Um clique: sincroniza conta e cartão com as sugestões automáticas (ver syncOpenFinance). */
export async function syncAllOpenFinance(input: unknown): Promise<ActionResult<SyncAllReport>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  if (!isPluggyConfigured()) return { ok: false, error: "Open Finance não configurado." };
  const parsed = syncAllSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escolha onde lançar cada conta." };
  try {
    const report = await syncOpenFinance(auth, parsed.data.targets, { rebuild: parsed.data.rebuild });
    refresh();
    const parts = [
      report.imported > 0 ? `${report.imported} transação(ões) nova(s)` : "Nada novo",
      report.createdAccount ? "conta criada" : null,
      report.createdCard ? "cartão criado" : null,
      "saldo ajustado ao do banco",
    ].filter(Boolean);
    return { ok: true, data: report, message: `${parts.join(" · ")}.` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function createCardFromOpenFinance(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = z.object({ pluggyAccountId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Cartão inválido." };
  try {
    const card = await createCardFromPluggy(auth, await getPluggyAccount(parsed.data.pluggyAccountId));
    refresh();
    return {
      ok: true,
      data: { id: card.id },
      message: `Cartão criado: fecha dia ${card.closingDay}, vence dia ${card.dueDay}.`,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Apaga os dados importados (pede a palavra LIMPAR como confirmação). */
export async function clearImports(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = z.object({ confirm: z.literal("LIMPAR") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Digite LIMPAR para confirmar." };
  try {
    const result = await clearImportedData(auth);
    refresh();
    return {
      ok: true,
      data: { removed: result.removed },
      message: `${result.removed} transação(ões) importada(s) removida(s). Os saldos das contas foram mantidos.`,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
