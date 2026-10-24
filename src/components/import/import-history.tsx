"use client";

import { Undo2 } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/domain/dates";
import { IMPORT_FORMAT_LABEL } from "@/domain/labels";
import type { Tables } from "@/lib/supabase/database.types";
import { undoImport } from "@/server/actions/imports";

export function ImportHistory({
  batches,
  targets,
  timezone,
}: {
  batches: Tables<"import_batches">[];
  targets: Record<string, string>;
  timezone: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Arquivo</TableHead>
            <TableHead className="hidden md:table-cell">Destino</TableHead>
            <TableHead className="text-right">Importadas</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Duplicadas</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Ignoradas</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Erros</TableHead>
            <TableHead>
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => {
            const errors = Array.isArray(b.errors) ? (b.errors as { line: number; reason: string }[]) : [];
            return (
              <TableRow key={b.id}>
                <TableCell className="max-w-56">
                  <p className="truncate font-medium">{b.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {IMPORT_FORMAT_LABEL[b.format]} · {formatDateTime(b.created_at, timezone)}
                  </p>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {targets[b.account_id ?? b.credit_card_id ?? ""] ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular">{b.imported_count}</TableCell>
                <TableCell className="hidden text-right tabular sm:table-cell">{b.duplicate_count}</TableCell>
                <TableCell className="hidden text-right tabular sm:table-cell">{b.skipped_count}</TableCell>
                <TableCell className="hidden text-right tabular sm:table-cell">
                  {b.error_count > 0 ? (
                    <Tooltip>
                      <TooltipTrigger className="underline decoration-dotted underline-offset-4">{b.error_count}</TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {errors.slice(0, 5).map((e) => (
                          <p key={e.line}>
                            Linha {e.line}: {e.reason}
                          </p>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    0
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {b.status === "undone" ? (
                    <Badge variant="secondary">Desfeita</Badge>
                  ) : (
                    <ConfirmAction
                      title="Desfazer importação?"
                      description={`Remove as ${b.imported_count} transação(ões) criadas por este arquivo, inclusive se você editou alguma depois. Lançamentos cadastrados à mão não são afetados.`}
                      confirmLabel="Desfazer"
                      action={undoImport}
                      input={{ id: b.id }}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Undo2 /> Desfazer
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
