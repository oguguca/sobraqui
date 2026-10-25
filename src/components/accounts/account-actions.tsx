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
import type { Tables } from "@/lib/db/types";
import { deleteAccount, setAccountArchived } from "@/server/actions/accounts";
import { useServerAction } from "@/hooks/use-server-action";

import { AccountFormDialog } from "./account-form-dialog";

export function AccountActions({ account }: { account: Tables<"accounts"> }) {
  const router = useRouter();
  const archive = useServerAction(setAccountArchived);
  const archived = Boolean(account.archived_at);

  return (
    <div className="flex items-center gap-1">
      <AccountFormDialog
        account={account}
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
                { id: account.id, archived: !archived },
                { success: archived ? "Conta reativada." : "Conta arquivada." },
              )
            }
          >
            {archived ? <ArchiveRestore /> : <Archive />}
            {archived ? "Reativar" : "Arquivar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            title="Excluir conta?"
            description="Só é possível excluir contas sem lançamentos. Para manter o histórico, arquive a conta."
            confirmLabel="Excluir"
            action={deleteAccount}
            input={{ id: account.id }}
            onDone={() => router.push("/contas")}
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
