import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// .env.local を読み込む（Next.js と同じ挙動）
config({ path: ".env.local", override: true });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL が設定されていません。.env.local ファイルを確認してください。",
  );
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
