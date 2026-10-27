import Link from "next/link";

import { auth } from "@/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/layout/sign-out-button";

import { navLinks } from "./nav-links";

export async function Header() {
  const session = await auth();

  return (
    <header className="bg-card sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">
          Passa<span className="text-primary">Aí</span>
        </Link>

        {session?.user ? (
          <nav className="hidden items-center gap-1 sm:flex">
            {navLinks.map(({ href, label }) => (
              <Button key={href} asChild variant="ghost" size="sm">
                <Link href={href}>{label}</Link>
              </Button>
            ))}
          </nav>
        ) : null}

        <div className="flex items-center gap-2">
          {session?.user ? (
            <>
              <Avatar className="size-8">
                <AvatarImage src={session.user.image ?? undefined} alt="" />
                <AvatarFallback>
                  {(session.user.name ?? session.user.email ?? "?")
                    .charAt(0)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <SignOutButton />
            </>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
