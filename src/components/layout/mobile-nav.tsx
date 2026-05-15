"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/dashboard/patients", label: "Pacientes", icon: Users },
  { href: "/dashboard/schedule", label: "Agenda", icon: CalendarDays },
  { href: "/dashboard/finances", label: "Financeiro", icon: Wallet },
  { href: "/dashboard/settings", label: "Config.", icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/70 bg-background/88 backdrop-blur-2xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-3 py-2 safe-bottom">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-2.5 text-center transition-all duration-300",
                isActive
                  ? "text-primary scale-105"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "relative flex h-8 w-11 items-center justify-center rounded-full transition-all duration-300",
                  isActive && "bg-primary/10"
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
                {isActive && (
                  <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              <span
                className={cn(
                  "truncate text-[10px] font-medium leading-none transition-all",
                  isActive && "font-semibold"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
