"use client";

import { CheckCircle2, CreditCard, Landmark, LayoutDashboard, Loader2, RefreshCw, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmAction } from "@/components/confirm-button";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/domain/money";
import {
  confirmOpenFinance,
  createCardFromOpenFinance,
  previewOpenFinance,
  syncAllOpenFinance,
  type OpenFinanceAccount,
} from "@/server/actions/imports";
import type { ImportReport } from "@/server/import-service";
import type { FormOptions } from "@/server/queries/core";

import { Count, PreviewStep, type Decision, type Preview } from "./import-wizard";

const STORAGE_KEY = "sobraqui:open-finance-targets";

function loadTargets(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveTargets(targets: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  } catch {
    // Preferência local; sem armazenamento, o usuário só escolhe de novo.
  }
}

/** Sincronização das contas do Nubank conectadas pelo Open Finance (Pluggy). */
export function OpenFinanceSync({
  accounts,
  options,
  today,
  defaultRange,
}: {
  accounts: OpenFinanceAccount[];
  options: FormOptions;
  today: string;
  /** Ciclo da fatura aberta (último fechamento até o vencimento). */
  defaultRange: { from: string; to: string };
}) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [active, setActive] = useState<OpenFinanceAccount | null>(null);
  const [range, setRange] = useState(defaultRange);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [paymentCardId, setPaymentCardId] = useState<string | null>(options.cards[0]?.id ?? null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [syncingAll, startSyncAll] = useTransition();
  const [creatingCard, startCreateCard] = useTransition();
  const router = useRouter();

  // Lê a escolha salva só no navegador, depois de montar (evita divergência de hidratação).
  useEffect(() => {
    const saved = loadTargets();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargets(saved);
  }, []);

  const destinationsFor = (a: OpenFinanceAccount) => (a.type === "CREDIT" ? options.cards : options.accounts);
  const targetFor = (a: OpenFinanceAccount) => {
    const saved = targets[a.id];
    const list = destinationsFor(a);
    return list.some((d) => d.id === saved) ? saved : (list[0]?.id ?? "");
  };

  function payload(account: OpenFinanceAccount, extra: Record<string, unknown> = {}) {
    return {
      pluggyAccountId: account.id,
      from: range.from,
      to: range.to,
      options: {
        target: account.type === "CREDIT" ? "card" : "account",
        targetId: targetFor(account),
        mapping: null,
        invoiceMonth: null,
        paymentCardId: account.type === "CREDIT" ? null : paymentCardId,
      },
      ...extra,
    };
  }

  function fetchPreview(account: OpenFinanceAccount) {
    setError(null);
    setReport(null);
    setActive(account);
    startTransition(async () => {
      const result = await previewOpenFinance(payload(account)).catch(() => null);
      if (!result) return setError("Falha de conexão. Tente de novo.");
      if (!result.ok) return setError(result.error);
      if (result.data.kind !== "preview") return setError("Resposta inesperada.");
      setPreview(result.data);
      setDecisions(
        Object.fromEntries(result.data.rows.map((r) => [r.index, { action: r.suggestedAction, categoryId: r.suggestedCategoryId }])),
      );
    });
  }

  const mappable = accounts.filter((a) => destinationsFor(a).length > 0);
  // Cartão sem destino é criado pelo servidor na sincronização.
  const syncable = accounts;
  const currentTargets = () => Object.fromEntries(mappable.map((a) => [a.id, targetFor(a)]));

  function createCard(account: OpenFinanceAccount) {
    startCreateCard(async () => {
      const result = await createCardFromOpenFinance({ pluggyAccountId: account.id }).catch(() => null);
      if (!result) return void toast.error("Falha de conexão. Tente de novo.");
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.message ?? "Cartão criado.");
      const next = { ...targets, [account.id]: result.data.id };
      setTargets(next);
      saveTargets(next);
      router.refresh();
    });
  }

  /** Um clique: sincroniza tudo com as sugestões automáticas e abre o dashboard. */
  function syncAll() {
    setError(null);
    setPreview(null);
    startSyncAll(async () => {
      const result = await syncAllOpenFinance({ targets: currentTargets(), rebuild: false }).catch(() => null);
      if (!result) return setError("Falha de conexão. Tente de novo.");
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Sincronizado.", {
        description: result.data.accounts.map((a) => `${a.name}: ${a.imported} nova(s)`).join(" · "),
      });
      router.push("/");
    });
  }

  function commit() {
    if (!active || !preview) return;
    startTransition(async () => {
      const list = preview.rows.map((r) => ({ index: r.index, ...decisions[r.index] }));
      const result = await confirmOpenFinance(payload(active, { decisions: list })).catch(() => null);
      if (!result) return setError("Falha de conexão. Tente de novo.");
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setReport(result.data);
      setPreview(null);
      toast.success(result.message ?? "Sincronização concluída.");
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Open Finance · Nubank</CardTitle>
          <CardDescription>
            Dados autorizados por você no app do banco e atualizados uma vez por dia pela Pluggy. Transações já
            sincronizadas são reconhecidas e não entram de novo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-positive/30 bg-positive-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Importar automaticamente</p>
              <p className="text-sm text-muted-foreground">
                Busca tudo desde a última sincronização, aplica as sugestões (tipo, forma de pagamento, categoria) e
                abre o dashboard atualizado.
                {accounts.some((a) => destinationsFor(a).length === 0) &&
                  " O que ainda não estiver cadastrado (conta ou cartão) é criado automaticamente com os dados do banco."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <ConfirmAction
                title="Refazer do zero?"
                description="Desfaz as sincronizações anteriores do Open Finance (lançamentos que você cadastrou à mão não são afetados) e importa tudo de novo com as regras atuais. Categorias que você ajustou em lançamentos sincronizados serão perdidas."
                confirmLabel="Refazer"
                action={syncAllOpenFinance}
                input={{ targets: currentTargets(), rebuild: true }}
                onDone={() => router.push("/")}
                trigger={
                  <Button variant="outline" disabled={syncingAll || pending || syncable.length === 0}>
                    <RotateCcw /> Refazer do zero
                  </Button>
                }
              />
              <Button onClick={syncAll} disabled={syncingAll || pending || syncable.length === 0}>
                {syncingAll ? <Loader2 className="animate-spin" /> : <Zap />}
                {syncingAll ? "Sincronizando…" : "Sincronizar tudo"}
                {!syncingAll && <LayoutDashboard className="opacity-70" />}
              </Button>
            </div>
          </div>

          <p className="text-sm font-medium">Ou revise antes de importar:</p>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <FormField id="of-from" label="De">
              <Input id="of-from" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </FormField>
            <FormField id="of-to" label="Até" hint="Padrão: ciclo da fatura aberta, do último fechamento ao vencimento.">
              <Input id="of-to" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </FormField>
          </div>

          <ul className="grid gap-3">
            {accounts.map((a) => {
              const destinations = destinationsFor(a);
              const Icon = a.type === "CREDIT" ? CreditCard : Landmark;
              return (
                <li key={a.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.marketingName ?? a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.type === "CREDIT" ? "Cartão de crédito" : "Conta"} {a.number ? `· ${a.number}` : ""} ·{" "}
                        {a.type === "CREDIT" ? "fatura atual" : "saldo"} {formatMoney(Math.round(a.balance * 100))}
                      </p>
                    </div>
                  </div>
                  {destinations.length === 0 && a.type === "CREDIT" ? (
                    <Button variant="secondary" disabled={creatingCard} onClick={() => createCard(a)}>
                      {creatingCard ? <Loader2 className="animate-spin" /> : <CreditCard />} Criar cartão automaticamente
                    </Button>
                  ) : destinations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Cadastre uma conta em{" "}
                      <Link className="underline" href="/contas">
                        Contas
                      </Link>
                      .
                    </p>
                  ) : (
                    <FormField id={`of-target-${a.id}`} label="Lançar em">
                      <Select
                        value={targetFor(a)}
                        onValueChange={(v) => {
                          const next = { ...targets, [a.id]: v };
                          setTargets(next);
                          saveTargets(next);
                        }}
                      >
                        <SelectTrigger id={`of-target-${a.id}`} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {destinations.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  )}
                  <Button
                    variant={active?.id === a.id ? "default" : "outline"}
                    disabled={pending || destinations.length === 0 || !range.from || !range.to}
                    onClick={() => fetchPreview(a)}
                  >
                    {pending && active?.id === a.id ? <Loader2 className="animate-spin" /> : <RefreshCw />} Buscar transações
                  </Button>
                </li>
              );
            })}
          </ul>

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="size-6 text-positive" />
              <p className="text-lg font-semibold">Sincronização concluída</p>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Count label="Novas" value={report.imported} />
              <Count label="Já existiam" value={report.duplicates} />
              <Count label="Ignoradas por você" value={report.skipped} />
              <Count label="Com erro" value={report.errors} />
            </dl>
            <div>
              <Button asChild>
                <Link href="/transacoes">Ver transações</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {preview && active && (
        <PreviewStep
          preview={preview}
          target={active.type === "CREDIT" ? "card" : "account"}
          options={options}
          decisions={decisions}
          setDecisions={setDecisions}
          invoiceMonth={null}
          setInvoiceMonth={() => {}}
          paymentCardId={paymentCardId}
          setPaymentCardId={setPaymentCardId}
          today={today}
          pending={pending}
          onCommit={commit}
          onCancel={() => setPreview(null)}
        />
      )}
    </div>
  );
}
