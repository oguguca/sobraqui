import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  total,
  pageSize,
  basePath,
  params,
}: {
  page: number;
  total: number;
  pageSize: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const href = (p: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === "string" && v && k !== "page") search.set(k, v);
    }
    if (p > 1) search.set("page", String(p));
    const qs = search.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 pt-4 text-sm" data-print-hidden>
      <p className="text-muted-foreground tabular">
        {first}–{last} de {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)}>
              <ChevronLeft /> <span className="max-sm:sr-only">Anterior</span>
            </Link>
          ) : (
            <span>
              <ChevronLeft /> <span className="max-sm:sr-only">Anterior</span>
            </span>
          )}
        </Button>
        <span className="tabular text-muted-foreground">
          {page}/{pages}
        </span>
        <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
          {page < pages ? (
            <Link href={href(page + 1)}>
              <span className="max-sm:sr-only">Próxima</span> <ChevronRight />
            </Link>
          ) : (
            <span>
              <span className="max-sm:sr-only">Próxima</span> <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
}
