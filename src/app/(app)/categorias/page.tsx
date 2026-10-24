import { Plus, Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryList } from "@/components/categories/category-list";
import { EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuth } from "@/server/auth";
import { listCategories } from "@/server/queries/core";

export const metadata: Metadata = { title: "Categorias" };

const GROUPS = [
  { kind: "expense", title: "Despesas", description: "Para onde o dinheiro vai." },
  { kind: "income", title: "Receitas", description: "De onde o dinheiro vem." },
  { kind: "transfer", title: "Transferências", description: "Movimentações entre suas contas." },
] as const;

export default async function CategoriesPage({ searchParams }: PageProps<"/categorias">) {
  const ctx = await requireAuth();
  const showArchived = (await searchParams).arquivadas === "1";
  const categories = await listCategories(ctx, { includeArchived: showArchived });

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Arquive categorias que não usa mais: o histórico continua intacto."
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={showArchived ? "/categorias" : "/categorias?arquivadas=1"}>
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
          </>
        }
      />
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
    </>
  );
}
