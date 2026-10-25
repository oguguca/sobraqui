import { cn } from "@/lib/utils";

// Símbolo Sobraqui (o "S" com o ponto que sobra). O traço segue a tinta do tema
// (berinjela no claro, branco no escuro) e o ponto acende em lilás no claro e
// em lima no escuro, como no guia da marca.
const SYMBOL_PATH =
  "M183.43 50A64 64 0 1 0 128 146A28 28 0 1 1 114 198.25L96 229.43A64 64 0 1 0 128 110A28 28 0 1 1 152.25 68Z";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <path d={SYMBOL_PATH} className="fill-[#2B1640] dark:fill-white" />
      <circle cx="84.25" cy="188.21" r="18" className="fill-brand-dot" />
    </svg>
  );
}

/** Ícone do app: símbolo branco com ponto lima sobre berinjela. */
export function BrandAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={cn("size-9 shrink-0", className)}>
      <rect width="256" height="256" rx="56" fill="#2B1640" />
      <g transform="translate(128 128) scale(0.68) translate(-128 -128)">
        <path d={SYMBOL_PATH} fill="#FFFFFF" />
        <circle cx="84.25" cy="188.21" r="18" fill="#C8F04A" />
      </g>
    </svg>
  );
}

/** Assinatura: símbolo + "sobraqui" em caixa baixa. */
export function Brand({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark className={size === "lg" ? "size-10" : "size-8"} />
      <span
        className={cn(
          "font-bold tracking-tight text-[#2B1640] lowercase dark:text-white",
          size === "lg" ? "text-3xl" : "text-xl",
        )}
      >
        sobraqui
      </span>
    </span>
  );
}
