"use client";

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
import { useServerAction } from "@/hooks/use-server-action";
import type { ActionResult } from "@/server/action";

/** Botão que pede confirmação antes de chamar uma Server Action destrutiva. */
export function ConfirmAction<I>({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive = true,
  action,
  input,
  success,
  onDone,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  action: (input: I) => Promise<ActionResult<unknown>>;
  input: I;
  success?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending } = useServerAction(action);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              run(input, {
                success,
                onSuccess: () => {
                  setOpen(false);
                  onDone?.();
                },
              });
            }}
          >
            {pending ? "Aguarde…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
