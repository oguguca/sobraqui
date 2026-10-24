"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

// Não mostra a mensagem técnica: pode conter detalhes internos.
export default function AppError({ reset, error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center" role="alert">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-negative-soft">
        <TriangleAlert className="size-6 text-negative" />
      </div>
      <h1 className="text-lg font-semibold">Não foi possível carregar esta página</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pode ser uma instabilidade na conexão com o banco de dados. Seus dados não foram alterados.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted-foreground">Código: {error.digest}</p>}
      <Button className="mt-6" onClick={reset}>
        <RefreshCw /> Tentar de novo
      </Button>
    </div>
  );
}
