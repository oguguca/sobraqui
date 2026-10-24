"use client";

import { Check } from "lucide-react";

import { PALETTE } from "@/domain/labels";
import { cn } from "@/lib/utils";

export function ColorPicker({
  value,
  onChange,
  id,
}: {
  value: string | null | undefined;
  onChange: (color: string) => void;
  id?: string;
}) {
  return (
    <div id={id} role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
      {PALETTE.map((color) => {
        const selected = value?.toLowerCase() === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected && "ring-2 ring-foreground/60",
            )}
            style={{ backgroundColor: color }}
          >
            {selected && <Check className="size-3.5 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
