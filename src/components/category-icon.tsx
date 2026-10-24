import {
  ArrowLeftRight,
  Baby,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Circle,
  CirclePlus,
  Coins,
  Dog,
  Droplet,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  PartyPopper,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import type { CategoryIconName } from "./category-icon-names";

export const CATEGORY_ICONS: Record<CategoryIconName, LucideIcon> = {
  circle: Circle,
  "circle-plus": CirclePlus,
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  house: House,
  car: Car,
  bus: Bus,
  fuel: Fuel,
  "heart-pulse": HeartPulse,
  pill: Pill,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  "party-popper": PartyPopper,
  film: Film,
  plane: Plane,
  repeat: Repeat,
  "shopping-bag": ShoppingBag,
  shirt: Shirt,
  gift: Gift,
  baby: Baby,
  dog: Dog,
  dumbbell: Dumbbell,
  smartphone: Smartphone,
  wifi: Wifi,
  zap: Zap,
  droplet: Droplet,
  receipt: Receipt,
  landmark: Landmark,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  coins: Coins,
  "hand-coins": HandCoins,
  "arrow-left-right": ArrowLeftRight,
  wrench: Wrench,
  sparkles: Sparkles,
};

/** Ícone da categoria num círculo com a cor dela. */
export function CategoryBadgeIcon({
  icon,
  color,
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[(icon ?? "circle") as CategoryIconName] ?? Circle;
  return (
    <span
      aria-hidden
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", className)}
      style={{
        backgroundColor: `color-mix(in oklab, ${color ?? "#64748b"} 14%, transparent)`,
        color: color ?? "#64748b",
      }}
    >
      <Icon className="size-4" />
    </span>
  );
}
