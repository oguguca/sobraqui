"use client";

import CountUp from "@/components/reactbits/CountUp";

/**
 * Valor em reais que "conta" até o número certo ao aparecer na tela.
 * Termina exatamente no mesmo texto de formatMoney (R$ 1.234,56).
 */
export function MoneyCountUp({
  cents,
  className,
  duration = 1.1,
  trigger = "load",
  signed = false,
}: {
  cents: number;
  className?: string;
  duration?: number;
  trigger?: "load" | "view";
  /** Mostra "+" nos positivos, como formatMoney(…, { signed: true }). */
  signed?: boolean;
}) {
  const sign = cents < 0 ? "-" : signed && cents > 0 ? "+" : "";
  return (
    <CountUp
      to={Math.abs(cents) / 100}
      decimals={2}
      separator="."
      decimalSeparator=","
      prefix={`${sign}R$ `}
      duration={duration}
      trigger={trigger}
      className={className}
    />
  );
}
