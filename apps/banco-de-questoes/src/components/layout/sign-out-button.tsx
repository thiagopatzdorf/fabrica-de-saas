import { LogOut } from "lucide-react";

import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        <LogOut />
        Sair
      </Button>
    </form>
  );
}
