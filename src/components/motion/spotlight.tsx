"use client";

import { useTheme } from "next-themes";
import type { CSSProperties, ReactNode } from "react";

import SpotlightCard from "@/components/reactbits/SpotlightCard";

/** Cartão com um brilho lilás que segue o cursor. Usa as cores do tema atual. */
export function Spotlight({
  children,
  className,
  surface = "var(--card)",
}: {
  children: ReactNode;
  className?: string;
  surface?: string;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <SpotlightCard
      theme={dark ? "dark" : "light"}
      spotlightColor={dark ? "#9b7bea" : "#6b4fd8"}
      intensity={dark ? 0.22 : 0.5}
      spotlightSize={260}
      className={className}
      style={
        {
          "--spotlight-card-surface": surface,
          "--spotlight-card-border": "var(--border)",
          "--spotlight-card-shadow": "none",
        } as CSSProperties
      }
    >
      {children}
    </SpotlightCard>
  );
}
