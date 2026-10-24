import {
  ArrowLeftRight,
  ChartPie,
  CreditCard,
  FileUp,
  LayoutDashboard,
  Landmark,
  Tags,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Visão geral",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
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
      { href: "/categorias", label: "Categorias", icon: Tags },
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
