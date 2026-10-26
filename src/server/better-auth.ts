import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { passwordProblem } from "@/lib/password";
import { serverEnv } from "@/lib/server-env";
import { adminDb, withUser } from "@/server/db";
import { DEFAULT_CATEGORIES } from "@/server/default-categories";
import { sendEmail } from "@/server/email";

const env = serverEnv();
const signupAllowed = process.env.ALLOW_SIGNUP === "true";

export const auth = betterAuth({
  appName: "Sobraqui",
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(adminDb as never, { provider: "postgresql", transaction: true }),
  account: {
    modelName: "authAccount",
    // Entrar com Google usando o mesmo e-mail da conta existente vincula as duas.
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  // IDs UUID gerados aqui (colunas uuid no banco).
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  emailAndPassword: {
    enabled: true,
    // Uso pessoal: cadastro só enquanto ALLOW_SIGNUP=true.
    disableSignUp: !signupAllowed,
    minPasswordLength: 10,
    maxPasswordLength: 72,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Sobraqui: redefinir senha",
        text: `Para criar uma nova senha, abra o link (válido por 30 minutos):\n${url}\n\nSe não foi você, ignore este e-mail.`,
        html: `<p>Para criar uma nova senha, abra o link abaixo (válido por 30 minutos):</p><p><a href="${url}">Redefinir senha</a></p><p>Se não foi você, ignore este e-mail.</p>`,
      });
    },
  },
  // Google só fica ativo com as credenciais configuradas (ver .env.example).
  socialProviders: isGoogleEnabled()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          // Qualquer conta Google pode entrar; o primeiro acesso cria o usuário.
        },
      }
    : {},
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 300, max: 10 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/request-password-reset": { window: 3600, max: 5 },
    },
  },
  hooks: {
    // Mesma política de senha do formulário, também para chamadas diretas à API.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" && ctx.path !== "/reset-password") return;
      const body = ctx.body as { password?: unknown; newPassword?: unknown } | undefined;
      const password = body?.password ?? body?.newPassword;
      const problem = typeof password === "string" ? passwordProblem(password) : "Informe a senha.";
      if (problem) throw new APIError("BAD_REQUEST", { message: problem });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Perfil e categorias iniciais de cada novo usuário.
        async after(user) {
          await adminDb.profile.create({ data: { id: user.id } });
          await withUser(user.id, (tx) =>
            tx.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: user.id })) }),
          );
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export function isGoogleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
