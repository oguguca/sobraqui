// Importação de extrato (CSV), limpar importados e zerar tudo, contra o banco real.
// Usa um usuário descartável e apaga tudo no final.
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const enabled = Boolean(process.env.DATABASE_URL);
const { adminDb, withUser, dbDate } = await import("@/server/db");
const { sourceFromUpload, buildImportPreview, commitImport, clearImportedData } = await import("@/server/import-service");
const { listAccounts } = await import("@/server/queries/core");

const USER = crypto.randomUUID();
const EMAIL = `imp${USER.slice(0, 8)}@imports.example.test`;

const ctx = {
  user: { id: USER, email: EMAIL, displayName: null, timezone: "America/Sao_Paulo" },
  db: <T,>(fn: Parameters<typeof withUser<T>>[1], o?: { timeoutMs?: number }) => withUser(USER, fn, o),
};

const CSV = [
  "Data,Valor,Identificador,Descrição",
  "05/10/2026,4500.00,id-1,Transferência recebida - Empresa",
  "12/10/2026,-234.90,id-2,Compra no débito - Mercado",
  "18/10/2026,-45.90,id-3,Transferência enviada pelo Pix - Uber",
].join("\n");

describe.skipIf(!enabled)("Importação de extrato", () => {
  let accountId = "";

  beforeAll(async () => {
    await adminDb.user.deleteMany({ where: { email: { endsWith: "@imports.example.test" } } });
    await adminDb.user.create({ data: { id: USER, name: "imp", email: EMAIL } });
    const { DEFAULT_CATEGORIES } = await import("@/server/default-categories");
    await withUser(USER, (tx) => tx.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: USER })) }));
    accountId = (
      await withUser(USER, (tx) => tx.bankAccount.create({ data: { user_id: USER, name: "Conta", type: "checking" } }))
    ).id;
  });

  afterAll(async () => {
    await adminDb.user.deleteMany({ where: { email: { endsWith: "@imports.example.test" } } });
    await adminDb.$disconnect();
  });

  const options = () => ({ target: "account" as const, targetId: accountId, mapping: null, invoiceMonth: null, paymentCardId: null });

  async function importCsv() {
    const source = sourceFromUpload({ bytes: new TextEncoder().encode(CSV), name: "extrato.csv" }, options());
    if ("kind" in source) throw new Error("mapeamento inesperado");
    const preview = await buildImportPreview(ctx, source, options());
    if (preview.kind !== "preview") throw new Error("prévia inesperada");
    const decisions = preview.rows.map((r) => ({ index: r.index, action: r.suggestedAction, categoryId: null }));
    return { preview, report: await commitImport(ctx, source, options(), decisions) };
  }

  it("importa o CSV da conta e não duplica ao reimportar", async () => {
    const { preview, report } = await importCsv();
    expect(preview.format).toBe("nubank_account_csv");
    expect(report.imported).toBe(3);
    const [account] = await listAccounts(ctx);
    expect(account.balance_cents).toBe(450000 - 23490 - 4590);

    const again = await importCsv().catch((e: Error) => e);
    // Tudo já existe: nada novo para importar.
    expect(again instanceof Error ? again.message : again.report.imported).toMatch(/Nenhuma linha|^0$/);
  });

  it("limpar dados importados mantém lançamentos manuais e o saldo", async () => {
    await withUser(USER, (tx) =>
      tx.transaction.create({
        data: { user_id: USER, kind: "expense", amount_cents: 1000, occurred_on: dbDate("2026-10-20"), description: "Manual", account_id: accountId, payment_method: "pix" },
      }),
    );
    const [before] = await listAccounts(ctx);
    const result = await clearImportedData(ctx);
    expect(result.removed).toBe(3);
    const [after] = await listAccounts(ctx);
    expect(after.balance_cents).toBe(before.balance_cents);
    const left = await withUser(USER, (tx) => tx.transaction.findMany({ where: { user_id: USER }, select: { description: true, import_batch_id: true } }));
    expect(left).toEqual([{ description: "Manual", import_batch_id: null }]);
  });

  it("zerar tudo apaga todos os registros e recria as categorias padrão", async () => {
    const { resetAllData } = await import("@/server/reset");
    const { DEFAULT_CATEGORIES } = await import("@/server/default-categories");
    // Outro usuário com dados: não pode ser afetado.
    const OTHER = crypto.randomUUID();
    await adminDb.user.create({ data: { id: OTHER, name: "outro", email: `outro${OTHER.slice(0, 8)}@imports.example.test` } });
    await withUser(OTHER, (tx) => tx.bankAccount.create({ data: { user_id: OTHER, name: "Conta do outro", type: "checking" } }));

    await resetAllData(ctx);
    const counts = await withUser(USER, async (tx) => ({
      transactions: await tx.transaction.count({ where: { user_id: USER } }),
      accounts: await tx.bankAccount.count({ where: { user_id: USER } }),
      cards: await tx.creditCard.count({ where: { user_id: USER } }),
      invoices: await tx.creditCardInvoice.count({ where: { user_id: USER } }),
      batches: await tx.importBatch.count({ where: { user_id: USER } }),
      categories: await tx.category.count({ where: { user_id: USER } }),
    }));
    expect(counts).toEqual({ transactions: 0, accounts: 0, cards: 0, invoices: 0, batches: 0, categories: DEFAULT_CATEGORIES.length });
    expect(await withUser(OTHER, (tx) => tx.bankAccount.count({ where: { user_id: OTHER } }))).toBe(1);
  });
});
