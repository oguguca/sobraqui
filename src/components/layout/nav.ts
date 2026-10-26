import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChartPie,
  CreditCard,
  FileUp,
  LayoutDashboard,
  Landmark,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/entradas", label: "Entradas", icon: ArrowDownLeft },
      { href: "/saidas", label: "Saídas", icon: ArrowUpRight },
      { href: "/transacoes", label: "Transações", icon: ArrowLeftRight },
      { href: "/relatorios", label: "Relatórios", icon: ChartPie },
    ],
  },
  {
    label: "Patrimônio",
    items: [
      { href: "/contas", label: "Contas", icon: Landmark },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
    ],
  },
  {
    label: "Planejamento",
    items: [
      { href: "/orcamento", label: "Orçamento", icon: Wallet },
      { href: "/metas", label: "Metas", icon: Target },
      { href: "/investimentos", label: "Investimentos", icon: TrendingUp },
    ],
  },
  {
    label: "Dados",
    items: [{ href: "/importacao", label: "Importação", icon: FileUp }],
  },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
