"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/hooks/use-server-action";
import { clearImports } from "@/server/actions/imports";

/** Zona de perigo: apaga os dados importados para começar a lançar à mão. */
export function ClearImports({ importedCount }: { importedCount: number }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const { run, pending } = useServerAction(clearImports);

  return (
    <Card className="mt-6 ring-destructive/30">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Limpar dados importados</p>
          <p className="text-sm text-muted-foreground">
            Remove as {importedCount} transação(ões) que vieram de importações de extrato. Lançamentos feitos à mão,
            contas, cartões e categorias ficam, e o saldo das contas é mantido.
          </p>
        </div>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            setConfirm("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="shrink-0 text-destructive" disabled={importedCount === 0}>
              <Trash2 /> Limpar tudo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar todos os dados importados?</AlertDialogTitle>
              <AlertDialogDescription>
                {importedCount} transação(ões) importada(s) serão excluídas, e os ajustes de fatura informados serão
                removidos. Não dá para desfazer. Você pode importar os extratos de novo depois, se quiser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-1.5">
              <label htmlFor="clear-confirm" className="text-sm">
                Digite <span className="font-semibold">LIMPAR</span> para confirmar
              </label>
              <Input id="clear-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending || confirm !== "LIMPAR"}
                onClick={(e) => {
                  e.preventDefault();
                  run({ confirm }, { onSuccess: () => setOpen(false) });
                }}
              >
                {pending ? "Apagando…" : "Apagar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
