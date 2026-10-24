"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/server/action";

/**
 * Executa uma Server Action mostrando toast de sucesso/erro e expondo os
 * erros de campo devolvidos pela validação do servidor.
 */
export function useServerAction<I, T>(action: (input: I) => Promise<ActionResult<T>>) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run(input: I, opts: { success?: string; onSuccess?: (data: T) => void } = {}) {
    startTransition(async () => {
      let result: ActionResult<T>;
      try {
        result = await action(input);
      } catch {
        toast.error("Falha de conexão. Verifique sua internet e tente de novo.");
        return;
      }
      if (result.ok) {
        setFieldErrors({});
        const message = opts.success ?? result.message;
        if (message) toast.success(message);
        opts.onSuccess?.(result.data);
      } else {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return { run, pending, fieldErrors, setFieldErrors };
}
