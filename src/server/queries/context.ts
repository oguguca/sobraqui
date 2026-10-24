import "server-only";

import { buildLookups } from "@/components/transactions/lookups";
import { todayIn } from "@/domain/dates";
import type { AuthContext } from "@/server/auth";

import { listAccounts, listCards, listCategories, type Account, type Category, type CreditCard } from "./core";

/**
 * Dados de apoio comuns às telas com lançamentos: nomes para exibição
 * (inclui arquivados) e opções ativas para os formulários.
 */
export async function loadLedgerContext(ctx: AuthContext) {
  const [accounts, categories, cards] = await Promise.all([
    listAccounts(ctx, { includeArchived: true }),
    listCategories(ctx, { includeArchived: true }),
    listCards(ctx, { includeArchived: true }),
  ]);
  const activeAccounts = accounts.filter((a) => !a.archived_at);
  const activeCategories = categories.filter((c) => !c.archived_at);
  const activeCards = cards.filter((c) => !c.archived_at);

  return {
    today: todayIn(ctx.user.timezone),
    accounts,
    categories,
    cards,
    activeAccounts,
    activeCategories,
    activeCards,
    lookups: buildLookups({ accounts, cards, categories }),
    formOptions: {
      accounts: activeAccounts.map((a) => ({ id: a.id, name: a.name })),
      categories: activeCategories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, icon: c.icon })),
      cards: activeCards.map((c) => ({ id: c.id, name: c.name })),
    },
  };
}

export type LedgerContext = Awaited<ReturnType<typeof loadLedgerContext>>;
export type { Account, Category, CreditCard };
