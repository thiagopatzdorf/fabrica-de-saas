import { beforeAll, describe, expect, it, vi } from "vitest";

const headers = () => new Headers({ origin: "http://localhost:8080", host: "localhost:8080" });
type AuthMod = typeof import("../src/lib/auth/server");
let auth: AuthMod["auth"];

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  ({ auth } = await import("../src/lib/auth/server"));
});

describe("login por e-mail e senha", () => {
  it("cadastra, entra com a senha certa e recusa a errada", async () => {
    const email = "pessoa@example.com";
    const up = await auth.api.signUpEmail({ body: { name: "Pessoa", email, password: "senha-longa-1" }, headers: headers() });
    expect(up.user.email).toBe(email);

    const ok = await auth.api.signInEmail({ body: { email, password: "senha-longa-1" }, headers: headers() });
    expect(ok.token).toBeTruthy();

    await expect(
      auth.api.signInEmail({ body: { email, password: "senha-errada-9" }, headers: headers() }),
    ).rejects.toThrow();
  });

  it("recusa senha com menos de 8 caracteres e e-mail repetido", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "X", email: "curta@example.com", password: "1234567" }, headers: headers() }),
    ).rejects.toThrow();
    await auth.api.signUpEmail({ body: { name: "Y", email: "dup@example.com", password: "senha-longa-2" }, headers: headers() });
    await expect(
      auth.api.signUpEmail({ body: { name: "Y", email: "dup@example.com", password: "senha-longa-3" }, headers: headers() }),
    ).rejects.toThrow();
  });

  it("a sessão devolve o usuário quando o cookie é enviado e nada sem ele", async () => {
    const res = await auth.api.signUpEmail({
      body: { name: "Sessão", email: "sessao@example.com", password: "senha-longa-4" },
      headers: headers(),
      returnHeaders: true,
    });
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const logged = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(logged?.user.email).toBe("sessao@example.com");
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});

describe("configuração segura", () => {
  it("em produção, sem BETTER_AUTH_SECRET o módulo se recusa a subir", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    await expect(import("../src/lib/auth/server")).rejects.toThrow(/BETTER_AUTH_SECRET/);
    vi.unstubAllEnvs();
  });

  it("segredo curto é recusado mesmo fora de produção", async () => {
    vi.resetModules();
    vi.stubEnv("BETTER_AUTH_SECRET", "curto");
    await expect(import("../src/lib/auth/server")).rejects.toThrow(/32 caracteres/);
    vi.unstubAllEnvs();
  });

  it("HUB_DISABLE_SIGNUP=true fecha o cadastro aberto", async () => {
    vi.resetModules();
    vi.stubEnv("HUB_DISABLE_SIGNUP", "true");
    const mod = await import("../src/lib/auth/server");
    expect(mod.signupDisabled).toBe(true);
    await expect(
      mod.auth.api.signUpEmail({ body: { name: "Z", email: "fechado@example.com", password: "senha-longa-5" }, headers: headers() }),
    ).rejects.toThrow();
    vi.unstubAllEnvs();
  });
});

describe("usuário de demonstração opcional", () => {
  it("sem HUB_DEMO_EMAIL/HUB_DEMO_PASSWORD nenhum usuário é criado", async () => {
    vi.resetModules();
    delete process.env.HUB_DEMO_EMAIL;
    delete process.env.HUB_DEMO_PASSWORD;
    const { ensureDemoAccess } = await import("../src/lib/hub/access.server");
    await ensureDemoAccess();
    const { auth: a } = await import("../src/lib/auth/server");
    await expect(
      a.api.signInEmail({ body: { email: "demo@example.com", password: "qualquer-coisa-1" }, headers: headers() }),
    ).rejects.toThrow();
  });

  it("com as duas variáveis definidas o usuário é criado e entra", async () => {
    vi.resetModules();
    vi.stubEnv("HUB_DEMO_EMAIL", "demo-teste@example.com");
    vi.stubEnv("HUB_DEMO_PASSWORD", "senha-de-teste-1");
    const { ensureDemoAccess } = await import("../src/lib/hub/access.server");
    await ensureDemoAccess();
    const { auth: a } = await import("../src/lib/auth/server");
    const r = await a.api.signInEmail({
      body: { email: "demo-teste@example.com", password: "senha-de-teste-1" },
      headers: headers(),
    });
    expect(r.token).toBeTruthy();
    vi.unstubAllEnvs();
  });
});
