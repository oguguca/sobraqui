"use client";

import { ArrowLeftRight, CreditCard, LayoutDashboard, Menu, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { FormOptions } from "@/server/queries/core";

import { isActive } from "./nav";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
];

const tabClass =
  "flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground outline-none transition-colors focus-visible:text-foreground data-[active=true]:text-foreground";

/**
 * Barra inferior do celular: abas principais, botão de lançamento no centro e
 * "Mais", que abre a sidebar como gaveta com o resto das abas.
 */
export function MobileNav({ options, today }: { options: FormOptions; today: string }) {
  const pathname = usePathname();
  const { openMobile, setOpenMobile } = useSidebar();
  const onTab = TABS.some((t) => isActive(pathname, t.href));
  const [home, transactions, cards] = TABS.map((t) => (
    <Link
      key={t.href}
      href={t.href}
      data-active={!openMobile && isActive(pathname, t.href)}
      aria-current={isActive(pathname, t.href) ? "page" : undefined}
      className={tabClass}
    >
      <t.icon className="size-5" aria-hidden />
      {t.label}
    </Link>
  ));

  return (
    <nav
      aria-label="Navegação principal"
      data-print-hidden
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/75 md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5">
        {home}
        {transactions}
        <div className="flex items-center justify-center">
          <TransactionFormDialog
            options={options}
            today={today}
            trigger={
              <button
                type="button"
                aria-label="Novo lançamento"
                className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
              >
                <Plus className="size-6" aria-hidden />
              </button>
            }
          />
        </div>
        {cards}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          data-active={openMobile || !onTab}
          aria-expanded={openMobile}
          className={cn(tabClass)}
        >
          <Menu className="size-5" aria-hidden />
          Mais
        </button>
      </div>
    </nav>
  );
}
