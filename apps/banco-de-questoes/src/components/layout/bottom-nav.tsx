"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { navLinks } from "./nav-links";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-40 border-t sm:hidden">
      <div className="grid grid-cols-3">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-xs",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
