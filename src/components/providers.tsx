"use client";

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        {children}
        {/* No celular, acima da barra inferior de navegação. */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          mobileOffset={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
