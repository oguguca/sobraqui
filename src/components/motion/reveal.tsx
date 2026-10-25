"use client";

import type { ReactNode } from "react";

import AnimatedContent from "@/components/reactbits/AnimatedContent";

/**
 * Entrada suave (sobe e aparece). "scroll" anima ao chegar na tela; "mount"
 * anima ao abrir a página. `stagger` anima os filhos diretos um após o outro.
 */
export function Reveal({
  children,
  className,
  trigger = "scroll",
  delay = 0,
  stagger = 0,
  distance = 28,
}: {
  children: ReactNode;
  className?: string;
  trigger?: "scroll" | "mount";
  delay?: number;
  stagger?: number;
  distance?: number;
}) {
  return (
    <AnimatedContent
      className={className}
      trigger={trigger}
      delay={delay}
      stagger={stagger}
      distance={distance}
      duration={0.7}
      ease="power3.out"
      threshold={0.12}
    >
      {children}
    </AnimatedContent>
  );
}
