import { Plus, Tags } from "lucide-react";
import Link from "next/link";

import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryList } from "@/components/categories/category-list";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Category } from "@/server/queries/core";

const GROUPS = [
  { kind: "expense", title: "Despesas", description: "Para onde o dinheiro vai." },
  { kind: "income", title: "Receitas", description: "De onde o dinheiro vem." },
  { kind: "transfer", title: "Transferências", description: "Movimentações entre suas contas." },
] as const;

/** Gestão de categorias, exibida dentro de Configurações. */
export function CategoriesSection({ categories, showArchived }: { categories: Category[]; showArchived: boolean }) {
  return (
    <section id="categorias" className="grid scroll-mt-20 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Categorias</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Arquive categorias que não usa mais: o histórico continua intacto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" asChild>
            <Link
              href={showArchived ? "/configuracoes#categorias" : "/configuracoes?arquivadas=1#categorias"}
              scroll={false}
            >
              {showArchived ? "Ocultar arquivadas" : "Ver arquivadas"}
            </Link>
          </Button>
          <CategoryFormDialog
            trigger={
              <Button>
                <Plus /> Nova categoria
              </Button>
            }
          />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {GROUPS.map((group) => {
          const items = categories.filter((c) => c.kind === group.kind);
          return (
            <Card key={group.kind}>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <EmptyState
                    icon={Tags}
                    title="Nenhuma categoria"
                    action={
                      <CategoryFormDialog
                        defaultKind={group.kind}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Plus /> Adicionar
                          </Button>
                        }
                      />
                    }
                  />
                ) : (
                  <CategoryList categories={items} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
