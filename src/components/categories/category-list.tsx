"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { CategoryBadgeIcon } from "@/components/category-icon";
import { ConfirmAction } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
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
import { deleteCategory, setCategoryArchived } from "@/server/actions/categories";

import { CategoryFormDialog } from "./category-form-dialog";

export function CategoryList({ categories }: { categories: Tables<"categories">[] }) {
  return (
    <ul className="divide-y">
      {categories.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2.5">
          <CategoryBadgeIcon icon={c.icon} color={c.color} />
          <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
          {c.archived_at && <Badge variant="secondary">Arquivada</Badge>}
          <CategoryActions category={c} />
        </li>
      ))}
    </ul>
  );
}

function CategoryActions({ category }: { category: Tables<"categories"> }) {
  const archive = useServerAction(setCategoryArchived);
  const archived = Boolean(category.archived_at);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${category.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <CategoryFormDialog
          category={category}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Pencil /> Editar
            </DropdownMenuItem>
          }
        />
        <DropdownMenuItem
          disabled={archive.pending}
          onSelect={() =>
            archive.run(
              { id: category.id, archived: !archived },
              { success: archived ? "Categoria reativada." : "Categoria arquivada." },
            )
          }
        >
          {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Reativar" : "Arquivar"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ConfirmAction
          title="Excluir categoria?"
          description="Só categorias sem lançamentos podem ser excluídas. Orçamentos desta categoria também serão removidos."
          confirmLabel="Excluir"
          action={deleteCategory}
          input={{ id: category.id }}
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
              <Trash2 /> Excluir
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
