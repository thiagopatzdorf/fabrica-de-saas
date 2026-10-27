import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppGate } from "@/components/boot";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/_app")({
  component: Layout,
});

function Layout() {
  return (
    <AppGate>
      <Shell>
        <Outlet />
      </Shell>
    </AppGate>
  );
}
