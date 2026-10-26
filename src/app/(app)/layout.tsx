import { cookies } from "next/headers";
import Link from "next/link";

import { Brand } from "@/components/brand";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { todayIn } from "@/domain/dates";
import { requireAuth } from "@/server/auth";
import { listFormOptions } from "@/server/queries/core";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireAuth();
  const { user } = ctx;
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const formOptions = await listFormOptions(ctx);

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar email={user.email} />
      <SidebarInset className="bg-background">
        <header
          data-print-hidden
          className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6"
        >
          {/* No celular a navegação fica na barra inferior; aqui só a marca. */}
          <Link href="/" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden">
            <Brand className="[&>span:last-child]:text-lg [&>svg]:size-7" />
          </Link>
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Separator orientation="vertical" className="mx-1 hidden data-[orientation=vertical]:h-4 md:block" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-8 md:py-8">
          {children}
        </div>
      </SidebarInset>
      <MobileNav options={formOptions} today={todayIn(user.timezone)} />
    </SidebarProvider>
  );
}
