"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import SoftAurora from "@/components/reactbits/SoftAurora";

const subscribe = () => () => {};

/**
 * Aurora suave em lilás, nas cores da marca (o lima fica reservado ao ponto).
 * Só desenha no navegador, depois de saber o tema.
 */
export function BrandAurora({
  className,
  opacity = 1,
  onDark = false,
}: {
  className?: string;
  opacity?: number;
  /** Sempre a versão escura, para fundos berinjela em qualquer tema. */
  onDark?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted || !resolvedTheme) return null;
  const dark = onDark || resolvedTheme === "dark";
  return (
    <div aria-hidden className={className}>
      <SoftAurora
        key={dark ? "dark" : "light"}
        color1={dark ? "#6b4fd8" : "#9b7bea"}
        color2={dark ? "#9b7bea" : "#6b4fd8"}
        spectrum={0}
        lightMode={!dark}
        brightness={dark ? 0.75 : 1}
        opacity={opacity}
        speed={0.4}
        bandHeight={0.55}
        mouseInfluence={0.15}
        clickPulse={false}
      />
    </div>
  );
}
