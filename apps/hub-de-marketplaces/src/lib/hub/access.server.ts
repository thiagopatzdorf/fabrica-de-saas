import { auth } from "@/lib/auth/server";

/**
 * Usuário de demonstração OPCIONAL. Só existe se HUB_DEMO_EMAIL e
 * HUB_DEMO_PASSWORD estiverem definidos (veja `exemplo.env`); sem as duas
 * variáveis esta função não faz nada e nenhuma credencial fixa existe no código.
 * Serve para avaliar o app sem passar pelo cadastro. Não use em produção.
 */
function demoCredentials(): { email: string; password: string } | null {
  const email = process.env.HUB_DEMO_EMAIL?.trim();
  const password = process.env.HUB_DEMO_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

let ready = false;
let inflight: Promise<void> | null = null;

export function alreadyThere(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const body = "body" in error ? (error as { body?: { code?: string; message?: string } }).body : undefined;
  const code = body?.code ?? "";
  const message = body?.message ?? (error instanceof Error ? error.message : "");
  return /EXIST/i.test(code) || /already/i.test(message);
}

async function createDemoAccess(creds: { email: string; password: string }): Promise<void> {
  try {
    await auth.api.signUpEmail({
      body: { name: "Demo", email: creds.email, password: creds.password },
      headers: new Headers({ origin: "http://127.0.0.1:8080", host: "127.0.0.1:8080" }),
    });
    ready = true;
  } catch (error) {
    if (alreadyThere(error)) {
      ready = true;
      return;
    }
    console.error("[hub] não consegui criar o usuário de demonstração", error);
  }
}

/** Idempotente. Recria o usuário de demonstração depois de um banco em memória reiniciar. */
export function ensureDemoAccess(): Promise<void> {
  const creds = demoCredentials();
  if (!creds || ready) return Promise.resolve();
  inflight ??= createDemoAccess(creds).finally(() => {
    inflight = null;
  });
  return inflight;
}
