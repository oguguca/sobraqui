"use client";

import { AlertTriangle, CheckCircle2, FileUp, Info, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormField } from "@/components/form-field";
import { Money } from "@/components/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addMonthsToMonth, formatDate, formatDateTime, formatMonth } from "@/domain/dates";
import { allowedActions } from "@/domain/import/pipeline";
import type { GenericCsvMapping, ImportAction, ImportTarget } from "@/domain/import/types";
import { IMPORT_FORMAT_LABEL } from "@/domain/labels";
import { cn } from "@/lib/utils";
import { confirmImport, previewImport } from "@/server/actions/imports";
import type { ImportReport, PreviewResult } from "@/server/import-service";
import type { FormOptions } from "@/server/queries/core";

type Preview = Extract<PreviewResult, { kind: "preview" }>;
type Decision = { action: ImportAction; categoryId: string | null };

const ACTION_LABEL: Record<ImportAction, string> = {
  income: "Receita",
  expense: "Despesa",
  refund: "Estorno",
  invoice_payment: "Pag. de fatura",
  skip: "Ignorar",
};
const NONE = "__none__";

const DEFAULT_MAPPING: GenericCsvMapping = {
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 2,
  idColumn: null,
  dateFormat: "dd/MM/yyyy",
  decimal: ",",
  invertSign: false,
};

export function ImportWizard({ options, today }: { options: FormOptions; today: string }) {
  const [target, setTarget] = useState<ImportTarget>(options.accounts.length > 0 ? "account" : "card");
  const [targetId, setTargetId] = useState<string>(options.accounts[0]?.id ?? options.cards[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<GenericCsvMapping | null>(null);
  const [mappingInfo, setMappingInfo] = useState<{ headers: string[]; sample: string[][] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [invoiceMonth, setInvoiceMonth] = useState<string | null>(null);
  const [paymentCardId, setPaymentCardId] = useState<string | null>(options.cards[0]?.id ?? null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const targets = target === "account" ? options.accounts : options.cards;

  function reset(keepFile = false) {
    setPreview(null);
    setDecisions({});
    setReport(null);
    setError(null);
    setMappingInfo(null);
    if (!keepFile) {
      setFile(null);
      setMapping(null);
    }
  }

  function formData(extra: Record<string, unknown> = {}) {
    const fd = new FormData();
    fd.set("file", file!);
    fd.set(
      "options",
      JSON.stringify({ target, targetId, mapping, invoiceMonth, paymentCardId: target === "account" ? paymentCardId : null }),
    );
    for (const [k, v] of Object.entries(extra)) fd.set(k, JSON.stringify(v));
    return fd;
  }

  function analyze(withMapping = mapping) {
    if (!file || !targetId) return;
    setError(null);
    startTransition(async () => {
      const fd = formData();
      fd.set("options", JSON.stringify({ target, targetId, mapping: withMapping, invoiceMonth: null, paymentCardId: null }));
      const result = await previewImport(fd).catch(() => null);
      if (!result) return setError("Falha de conexão. Tente de novo.");
      if (!result.ok) return setError(result.error);
      if (result.data.kind === "mapping") {
        setMappingInfo(result.data);
        setMapping((m) => m ?? DEFAULT_MAPPING);
        setPreview(null);
        return;
      }
      setMappingInfo(null);
      setPreview(result.data);
      setInvoiceMonth(result.data.suggestedInvoiceMonth);
      setDecisions(
        Object.fromEntries(
          result.data.rows.map((r) => [r.index, { action: r.suggestedAction, categoryId: r.suggestedCategoryId }]),
        ),
      );
    });
  }

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      const list = preview.rows.map((r) => ({ index: r.index, ...decisions[r.index] }));
      const result = await confirmImport(formData({ decisions: list })).catch(() => null);
      if (!result) return setError("Falha de conexão. Tente de novo.");
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setReport(result.data);
      setPreview(null);
      toast.success(result.message ?? "Importação concluída.");
    });
  }

  if (options.accounts.length === 0 && options.cards.length === 0) {
    return (
      <Alert>
        <Info />
        <AlertTitle>Cadastre o destino primeiro</AlertTitle>
        <AlertDescription>
          Crie a conta (ex.: Nubank) ou o cartão em <Link href="/contas" className="underline">Contas</Link> ou{" "}
          <Link href="/cartoes" className="underline">Cartões</Link> antes de importar.
        </AlertDescription>
      </Alert>
    );
  }

  if (report) {
    return (
      <Card>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 text-positive" />
            <p className="text-lg font-semibold">Importação concluída</p>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Count label="Importadas" value={report.imported} />
            <Count label="Duplicadas (puladas)" value={report.duplicates} />
            <Count label="Ignoradas por você" value={report.skipped} />
            <Count label="Linhas com erro" value={report.errors} />
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/transacoes">Ver transações</Link>
            </Button>
            <Button variant="outline" onClick={() => reset()}>
              Importar outro arquivo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Arquivo e destino</CardTitle>
          <CardDescription>
            CSV ou OFX de até 2 MB. O arquivo é lido no servidor e não fica armazenado; só as transações confirmadas são
            gravadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Tabs
            value={target}
            onValueChange={(v) => {
              const t = v as ImportTarget;
              setTarget(t);
              setTargetId((t === "account" ? options.accounts : options.cards)[0]?.id ?? "");
              reset(true);
            }}
          >
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="account" disabled={options.accounts.length === 0}>
                Extrato de conta
              </TabsTrigger>
              <TabsTrigger value="card" disabled={options.cards.length === 0}>
                Fatura de cartão
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="import-target" label={target === "account" ? "Conta" : "Cartão"}>
              <Select
                value={targetId}
                onValueChange={(v) => {
                  setTargetId(v);
                  reset(true);
                }}
              >
                <SelectTrigger id="import-target" className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="import-file" label="Arquivo">
              <Input
                id="import-file"
                type="file"
                accept=".csv,.ofx,.txt,text/csv,application/x-ofx"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  reset(true);
                  setMapping(null);
                }}
              />
            </FormField>
          </div>
          <div>
            <Button onClick={() => analyze()} disabled={!file || !targetId || pending}>
              {pending ? <Loader2 className="animate-spin" /> : <FileUp />} Analisar arquivo
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertTriangle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {mappingInfo && mapping && (
        <MappingStep
          info={mappingInfo}
          mapping={mapping}
          onChange={setMapping}
          onApply={() => analyze(mapping)}
          pending={pending}
        />
      )}

      {preview && (
        <PreviewStep
          preview={preview}
          target={target}
          options={options}
          decisions={decisions}
          setDecisions={setDecisions}
          invoiceMonth={invoiceMonth}
          setInvoiceMonth={setInvoiceMonth}
          paymentCardId={paymentCardId}
          setPaymentCardId={setPaymentCardId}
          today={today}
          pending={pending}
          onCommit={commit}
          onCancel={() => reset(true)}
        />
      )}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-xl font-semibold">{value}</dd>
    </div>
  );
}

function MappingStep({
  info,
  mapping,
  onChange,
  onApply,
  pending,
}: {
  info: { headers: string[]; sample: string[][] };
  mapping: GenericCsvMapping;
  onChange: (m: GenericCsvMapping) => void;
  onApply: () => void;
  pending: boolean;
}) {
  const column = (key: "dateColumn" | "amountColumn" | "descriptionColumn", label: string) => (
    <FormField id={`map-${key}`} label={label}>
      <Select value={String(mapping[key])} onValueChange={(v) => onChange({ ...mapping, [key]: Number(v) })}>
        <SelectTrigger id={`map-${key}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {info.headers.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              {h || `Coluna ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Mapear colunas</CardTitle>
        <CardDescription>Não reconheci o layout deste CSV. Diga qual coluna é qual.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {info.headers.map((h, i) => (
                  <TableHead key={i}>{h || `Coluna ${i + 1}`}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {info.sample.map((row, r) => (
                <TableRow key={r}>
                  {info.headers.map((_, i) => (
                    <TableCell key={i} className="max-w-48 truncate text-muted-foreground">
                      {row[i]}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {column("dateColumn", "Data")}
          {column("descriptionColumn", "Descrição")}
          {column("amountColumn", "Valor")}
          <FormField id="map-id" label="Identificador (opcional)">
            <Select
              value={mapping.idColumn === null ? NONE : String(mapping.idColumn)}
              onValueChange={(v) => onChange({ ...mapping, idColumn: v === NONE ? null : Number(v) })}
            >
              <SelectTrigger id="map-id" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {info.headers.map((h, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {h || `Coluna ${i + 1}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="map-date" label="Formato da data">
            <Select
              value={mapping.dateFormat}
              onValueChange={(v) => onChange({ ...mapping, dateFormat: v as GenericCsvMapping["dateFormat"] })}
            >
              <SelectTrigger id="map-date" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dd/MM/yyyy">31/12/2026</SelectItem>
                <SelectItem value="yyyy-MM-dd">2026-12-31</SelectItem>
                <SelectItem value="MM/dd/yyyy">12/31/2026</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField id="map-decimal" label="Separador decimal">
            <Select
              value={mapping.decimal}
              onValueChange={(v) => onChange({ ...mapping, decimal: v as GenericCsvMapping["decimal"] })}
            >
              <SelectTrigger id="map-decimal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=",">Vírgula (1.234,56)</SelectItem>
                <SelectItem value=".">Ponto (1,234.56)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={mapping.invertSign} onCheckedChange={(v) => onChange({ ...mapping, invertSign: v })} />
          Despesas aparecem com valor positivo neste arquivo
        </label>
        <div>
          <Button onClick={onApply} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Aplicar mapeamento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStep({
  preview,
  target,
  options,
  decisions,
  setDecisions,
  invoiceMonth,
  setInvoiceMonth,
  paymentCardId,
  setPaymentCardId,
  today,
  pending,
  onCommit,
  onCancel,
}: {
  preview: Preview;
  target: ImportTarget;
  options: FormOptions;
  decisions: Record<number, Decision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<number, Decision>>>;
  invoiceMonth: string | null;
  setInvoiceMonth: (m: string) => void;
  paymentCardId: string | null;
  setPaymentCardId: (id: string) => void;
  today: string;
  pending: boolean;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const actions = allowedActions(target);
  const selected = preview.rows.filter((r) => !r.duplicate && decisions[r.index]?.action !== "skip");
  const needsPaymentCard = selected.some((r) => decisions[r.index]?.action === "invoice_payment");
  const duplicates = preview.rows.filter((r) => r.duplicate).length;
  const manualFlags = preview.rows.filter((r) => r.possibleManualDuplicate).length;

  const invoiceMonths = useMemo(() => {
    const base = invoiceMonth ?? today.slice(0, 7);
    return Array.from({ length: 9 }, (_, i) => addMonthsToMonth(base, i - 6));
  }, [invoiceMonth, today]);

  const update = (index: number, patch: Partial<Decision>) =>
    setDecisions((d) => ({ ...d, [index]: { ...d[index], ...patch } }));

  const categoriesFor = (action: ImportAction) =>
    options.categories.filter((c) =>
      action === "income" ? c.kind === "income" : action === "expense" || action === "refund" ? c.kind === "expense" : false,
    );

  const blocked = (target === "card" && !invoiceMonth) || (needsPaymentCard && !paymentCardId) || selected.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Revisar antes de importar</CardTitle>
        <CardDescription>
          {IMPORT_FORMAT_LABEL[preview.format]} · {preview.fileName} · {preview.rows.length} linha(s) lida(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {preview.previousImportAt && (
          <Alert>
            <Info />
            <AlertDescription>
              Este mesmo arquivo já foi importado em {formatDateTime(preview.previousImportAt)}. As linhas repetidas
              foram marcadas como duplicadas.
            </AlertDescription>
          </Alert>
        )}
        {preview.targetMismatch && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              O arquivo parece ser {target === "account" ? "de cartão de crédito" : "de conta"}. Confira o destino escolhido.
            </AlertDescription>
          </Alert>
        )}
        {preview.errors.length > 0 && (
          <Alert>
            <AlertTriangle />
            <AlertTitle>{preview.errors.length} linha(s) não puderam ser lidas e serão ignoradas</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc pl-4">
                {preview.errors.slice(0, 5).map((e) => (
                  <li key={e.line}>
                    Linha {e.line}: {e.reason}
                  </li>
                ))}
                {preview.errors.length > 5 && <li>…e mais {preview.errors.length - 5}.</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-4">
          {target === "card" && (
            <FormField id="import-invoice" label="Fatura que recebe estas compras" className="w-64">
              <Select value={invoiceMonth ?? ""} onValueChange={setInvoiceMonth}>
                <SelectTrigger id="import-invoice" className="w-full capitalize">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {invoiceMonths.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {formatMonth(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {target === "account" && needsPaymentCard && (
            <FormField id="import-payment-card" label="Cartão pago pelos pagamentos de fatura" className="w-64">
              <Select value={paymentCardId ?? ""} onValueChange={setPaymentCardId}>
                <SelectTrigger id="import-payment-card" className="w-full">
                  <SelectValue placeholder={options.cards.length ? "Selecione" : "Nenhum cartão cadastrado"} />
                </SelectTrigger>
                <SelectContent>
                  {options.cards.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{selected.length}</span> para importar · {duplicates} duplicada(s)
          {manualFlags > 0 && ` · ${manualFlags} parecida(s) com lançamentos manuais (desmarcadas)`}
        </p>

        <div className="max-h-[60svh] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Importar</span>
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((r) => {
                const d = decisions[r.index] ?? { action: r.suggestedAction, categoryId: null };
                const skip = r.duplicate || d.action === "skip";
                const fallback = r.suggestedAction === "skip" ? (target === "card" ? "expense" : r.signedCents > 0 ? "income" : "expense") : r.suggestedAction;
                const cats = categoriesFor(d.action);
                return (
                  <TableRow key={r.index} className={cn(skip && "opacity-55")}>
                    <TableCell>
                      <Checkbox
                        checked={!skip}
                        disabled={r.duplicate}
                        aria-label={`Importar ${r.description}`}
                        onCheckedChange={(v) => update(r.index, { action: v ? fallback : "skip" })}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular text-muted-foreground">{formatDate(r.occurredOn)}</TableCell>
                    <TableCell className="max-w-72">
                      <p className="truncate">{r.description}</p>
                      {r.suggestion && (
                        <p className={cn("text-xs", r.duplicate || r.possibleManualDuplicate ? "text-warning" : "text-muted-foreground")}>
                          {r.suggestion}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <Money cents={r.signedCents} tone="auto" signed />
                    </TableCell>
                    <TableCell>
                      {r.duplicate ? (
                        <Badge variant="secondary">Duplicada</Badge>
                      ) : (
                        <Select value={d.action} onValueChange={(v) => update(r.index, { action: v as ImportAction, categoryId: null })}>
                          <SelectTrigger size="sm" className="w-36" aria-label="Tipo">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {actions.map((a) => (
                              <SelectItem key={a} value={a}>
                                {ACTION_LABEL[a]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      {!skip && cats.length > 0 && (
                        <Select
                          value={d.categoryId && cats.some((c) => c.id === d.categoryId) ? d.categoryId : NONE}
                          onValueChange={(v) => update(r.index, { categoryId: v === NONE ? null : v })}
                        >
                          <SelectTrigger size="sm" className="w-40" aria-label="Categoria">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sem categoria</SelectItem>
                            {cats.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onCommit} disabled={pending || blocked}>
            {pending && <Loader2 className="animate-spin" />} Importar {selected.length} transação(ões)
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            <RotateCcw /> Recomeçar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
