import { cookies } from "next/headers";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireAuth } from "@/server/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAuth();
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar email={user.email} />
      <SidebarInset className="bg-background">
        <header
          data-print-hidden
          className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6"
        >
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
