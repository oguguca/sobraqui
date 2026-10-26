import "server-only";

import type { DateRange } from "@/domain/dates";
import type { AuthContext } from "@/server/auth";

import { listAccounts, type Account } from "./core";
import { dateRange } from "./transactions";

export type InvestmentFlows = { depositsCents: number; withdrawalsCents: number; earningsCents: number };

export type InvestmentSummary = {
  accounts: (Account & InvestmentFlows)[];
  totalCents: number;
} & InvestmentFlows;

const emptyFlows = (): InvestmentFlows => ({ depositsCents: 0, withdrawalsCents: 0, earningsCents: 0 });

/**
 * Contas do tipo investimento com saldo atual e o movimento do período:
 * aportes (transferência vinda de outra conta), resgates (transferência para
 * outra conta) e rendimentos (receitas lançadas na própria conta). Só efetivados.
 * Transferências entre duas contas de investimento não contam como aporte nem resgate.
 */
export async function investmentSummary(ctx: AuthContext, range: DateRange): Promise<InvestmentSummary> {
  const accounts = (await listAccounts(ctx)).filter((a) => a.type === "investment");
  const ids = new Set(accounts.map((a) => a.id));
  const flows = new Map(accounts.map((a) => [a.id, emptyFlows()]));

  if (ids.size > 0) {
    const rows = await ctx.db((tx) =>
      tx.transaction.findMany({
        where: {
          user_id: ctx.user.id,
          status: "paid",
          kind: { in: ["transfer", "income"] },
          ...dateRange(range.from, range.to),
          OR: [{ account_id: { in: [...ids] } }, { destination_account_id: { in: [...ids] } }],
        },
        select: { kind: true, amount_cents: true, account_id: true, destination_account_id: true },
      }),
    );
    for (const r of rows) {
      const cents = Number(r.amount_cents);
      const fromInvestment = r.account_id !== null && ids.has(r.account_id);
      const toInvestment = r.destination_account_id !== null && ids.has(r.destination_account_id);
      if (r.kind === "income" && fromInvestment) flows.get(r.account_id!)!.earningsCents += cents;
      else if (r.kind === "transfer" && toInvestment && !fromInvestment)
        flows.get(r.destination_account_id!)!.depositsCents += cents;
      else if (r.kind === "transfer" && fromInvestment && !toInvestment)
        flows.get(r.account_id!)!.withdrawalsCents += cents;
    }
  }

  const rows = accounts
    .map((a) => ({ ...a, ...flows.get(a.id)! }))
    .sort((a, b) => b.balance_cents - a.balance_cents);
  const sum = (key: keyof InvestmentFlows) => rows.reduce((total, a) => total + a[key], 0);
  return {
    accounts: rows,
    totalCents: rows.reduce((total, a) => total + a.balance_cents, 0),
    depositsCents: sum("depositsCents"),
    withdrawalsCents: sum("withdrawalsCents"),
    earningsCents: sum("earningsCents"),
  };
}
