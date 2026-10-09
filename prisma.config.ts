import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not required for `prisma generate` (runs at install/build time without a DB).
    // Migrations/seed read the real value at deploy time.
    url: process.env.DATABASE_URL ?? "",
  },
});
