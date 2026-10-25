import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// CLI do Prisma (migrações). Localmente lê .env.local; na Vercel, as variáveis do projeto.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrações usam a conexão direta (sem o pooler PgBouncer do Neon).
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
