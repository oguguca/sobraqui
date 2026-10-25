"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { resetEverything } from "@/server/actions/reset";

/** Zona de perigo: apaga todos os registros financeiros. */
export function ResetEverything({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const { run, pending } = useServerAction(resetEverything);

  return (
    <Card className={className ?? "ring-destructive/40"}>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-medium text-destructive">
            <TriangleAlert className="size-4" /> Zerar todos os dados
          </p>
          <p className="text-sm text-muted-foreground">
            Apaga transações, contas, cartões, faturas, categorias, orçamentos, metas e importações. Seu login e suas
            preferências ficam; as categorias padrão são recriadas.
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
            <Button variant="destructive" className="shrink-0">
              Zerar tudo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zerar absolutamente tudo?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os seus registros financeiros serão excluídos permanentemente, inclusive os lançados à mão. Não dá
                para desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-1.5">
              <label htmlFor="reset-confirm" className="text-sm">
                Digite <span className="font-semibold">ZERAR</span> para confirmar
              </label>
              <Input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending || confirm !== "ZERAR"}
                onClick={(e) => {
                  e.preventDefault();
                  run(
                    { confirm },
                    {
                      onSuccess: () => {
                        setOpen(false);
                        router.push("/");
                      },
                    },
                  );
                }}
              >
                {pending ? "Zerando…" : "Zerar tudo"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
