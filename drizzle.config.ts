import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations into ./drizzle. They are applied by `npm run db:migrate`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
