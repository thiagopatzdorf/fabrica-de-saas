import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { ensureDemoAccess } from "@/lib/hub/access.server";

async function handle(request: Request) {
  await ensureDemoAccess();
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
