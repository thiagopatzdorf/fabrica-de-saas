import type { LucideIcon } from "lucide-react";
import { BarChart3, GraduationCap, TrendingUp } from "lucide-react";

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navLinks: NavLink[] = [
  { href: "/concursos", label: "Concursos", icon: GraduationCap },
  { href: "/progresso", label: "Progresso", icon: BarChart3 },
  { href: "/minha-chance", label: "Minha chance", icon: TrendingUp },
];
