import type { CategoryIconName } from "@/components/category-icon-names";
import type { Enums } from "@/lib/db/types";

export const DEFAULT_CATEGORIES: { name: string; kind: Enums<"category_kind">; icon: CategoryIconName; color: string }[] = [
  { name: "Alimentação", kind: "expense", icon: "utensils", color: "#f97316" },
  { name: "Moradia", kind: "expense", icon: "house", color: "#8b5cf6" },
  { name: "Transporte", kind: "expense", icon: "car", color: "#0ea5e9" },
  { name: "Saúde", kind: "expense", icon: "heart-pulse", color: "#ef4444" },
  { name: "Educação", kind: "expense", icon: "graduation-cap", color: "#6366f1" },
  { name: "Lazer", kind: "expense", icon: "party-popper", color: "#ec4899" },
  { name: "Assinaturas", kind: "expense", icon: "repeat", color: "#14b8a6" },
  { name: "Compras", kind: "expense", icon: "shopping-bag", color: "#eab308" },
  { name: "Juros e tarifas", kind: "expense", icon: "receipt", color: "#a16207" },
  { name: "Pix para pessoas", kind: "expense", icon: "hand-coins", color: "#0f766e" },
  { name: "Outros gastos", kind: "expense", icon: "circle", color: "#64748b" },
  { name: "Salário", kind: "income", icon: "briefcase", color: "#16a34a" },
  { name: "Freelance", kind: "income", icon: "hand-coins", color: "#0d9488" },
  { name: "Investimentos", kind: "income", icon: "trending-up", color: "#059669" },
  { name: "Outras receitas", kind: "income", icon: "circle-plus", color: "#22c55e" },
  { name: "Transferências", kind: "transfer", icon: "arrow-left-right", color: "#94a3b8" },
];
