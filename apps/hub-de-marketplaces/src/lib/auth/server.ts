/**
 * Autenticação do Hub (somente servidor): Better Auth com e-mail e senha.
 *
 * O Better Auth roda dentro do próprio app, em `/api/auth/*`, e guarda usuários
 * e sessões no mesmo banco dos dados (Postgres via `DATABASE_URL`; PGlite quando
 * a variável não existe). O esquema está em `migrations/0001_auth.sql`.
 *
 * Variáveis (veja `exemplo.env`):
 *   BETTER_AUTH_SECRET  obrigatória em produção (>= 32 caracteres)
 *   BETTER_AUTH_URL     URL pública do app, ex.: https://hub.exemplo.com
 *   TRUSTED_ORIGINS     origens extras aceitas em POST, separadas por vírgula
 *   HUB_DISABLE_SIGNUP  "true" fecha o cadastro aberto depois de criar os usuários
 *
 * NUNCA importe este módulo do código de navegador: o cliente usa `./client`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { pgliteDialect } from "./pglite-dialect";

// Começa (e compartilha) a abertura do PGlite assim que este módulo carrega.
void ensureDbReady();

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const isProduction = process.env.NODE_ENV === "production";

/**
 * Sem segredo em produção o app não sobe: um segredo aleatório por processo
 * derrubaria todas as sessões a cada reinício e, pior, mascararia a falta de
 * configuração. Em desenvolvimento gera um e mantém em `globalThis` para o
 * hot reload não invalidar as sessões.
 */
const globalRef = globalThis as typeof globalThis & { __hubDevSecret__?: string };
function authSecret(): string {
  const configured = env("BETTER_AUTH_SECRET");
  if (configured) {
    if (configured.length < 32) {
      throw new Error("BETTER_AUTH_SECRET precisa ter pelo menos 32 caracteres.");
    }
    return configured;
  }
  if (isProduction) {
    throw new Error("Defina BETTER_AUTH_SECRET (>= 32 caracteres) para rodar em produção.");
  }
  globalRef.__hubDevSecret__ ??= randomBytes(32).toString("hex");
  return globalRef.__hubDevSecret__;
}

const baseURL = env("BETTER_AUTH_URL") ?? "http://localhost:8080";

// Origens aceitas em POST com credencial (cadastro/login). Faltar uma aqui
// aparece como "Invalid origin".
const trustedOrigins = [
  baseURL,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
  ...(env("TRUSTED_ORIGINS")?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Cadastro aberto por padrão (demonstração). Em produção feche com HUB_DISABLE_SIGNUP=true. */
export const signupDisabled = env("HUB_DISABLE_SIGNUP") === "true";

export const auth = betterAuth({
  baseURL,
  secret: authSecret(),
  database,
  trustedOrigins,
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  emailAndPassword: {
    enabled: true,
    disableSignUp: signupDisabled,
    minPasswordLength: 8,
  },
  // Deve ser o ÚLTIMO: leva o Set-Cookie do Better Auth para as respostas do TanStack Start.
  plugins: [tanstackStartCookies()],
});
