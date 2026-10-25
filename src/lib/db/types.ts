// Tipos de linha do banco, derivados do client Prisma (já com centavos em
// number e datas em texto ISO, ver src/server/db.ts). Só tipos: seguro para
// importar em componentes de cliente.

import type * as Enum from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";

type Row<M extends keyof Tx> = Tx[M] extends { findFirstOrThrow: (...args: never[]) => infer R }
  ? Awaited<R>
  : never;

type TableModels = {
  profiles: "profile";
  accounts: "bankAccount";
  categories: "category";
  credit_cards: "creditCard";
  credit_card_invoices: "creditCardInvoice";
  recurring_transactions: "recurringTransaction";
  import_batches: "importBatch";
  transactions: "transaction";
  budgets: "budget";
  financial_goals: "financialGoal";
};

export type Tables<T extends keyof TableModels> = Row<TableModels[T]>;

export type Enums<T extends keyof typeof Enum> = (typeof Enum)[T][keyof (typeof Enum)[T]];
