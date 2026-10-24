import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9 20.5c1.6 1.6 4 2.5 6.8 2.5 3.6 0 6.2-1.7 6.2-4.4 0-2.5-2-3.6-5.6-4.2l-1.6-.3c-1.9-.3-2.6-.8-2.6-1.7 0-1 1.1-1.7 3-1.7 1.7 0 3.1.6 4.2 1.6"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        className="stroke-positive"
      />
    </svg>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight">Sobraqui</span>
    </span>
  );
}
