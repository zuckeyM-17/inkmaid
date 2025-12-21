import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// PostgreSQLクライアント
const client = postgres(connectionString);

// Drizzle ORMインスタンス
export const db = drizzle(client, { schema });

export { schema };
