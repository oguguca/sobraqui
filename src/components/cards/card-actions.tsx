"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { ConfirmAction } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useServerAction } from "@/hooks/use-server-action";
import type { Tables } from "@/lib/db/types";
import { deleteCard, setCardArchived } from "@/server/actions/cards";

import { CardFormDialog } from "./card-form-dialog";

export function CardActions({
  card,
  accounts,
}: {
  card: Tables<"credit_cards">;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const archive = useServerAction(setCardArchived);
  const archived = Boolean(card.archived_at);
  return (
    <div className="flex items-center gap-1">
      <CardFormDialog
        card={card}
        accounts={accounts}
        trigger={
          <Button variant="outline" size="sm">
            <Pencil /> Editar
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais ações">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={archive.pending}
            onSelect={() =>
              archive.run(
                { id: card.id, archived: !archived },
                { success: archived ? "Cartão reativado." : "Cartão arquivado." },
              )
            }
          >
            {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Reativar" : "Arquivar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            title="Excluir cartão?"
            description="Só é possível excluir cartões sem compras. Para manter o histórico, arquive."
            confirmLabel="Excluir"
            action={deleteCard}
            input={{ id: card.id }}
            onDone={() => router.push("/cartoes")}
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Excluir
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
