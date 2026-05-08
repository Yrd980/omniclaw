import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DatabaseConnection = ReturnType<typeof createDatabaseConnection>;

export const createDatabaseConnection = (databaseUrl = process.env.DATABASE_URL) => {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a Postgres database connection");
  }

  const client = postgres(databaseUrl, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    prepare: false,
  });

  return {
    client,
    db: drizzle(client, { schema }),
    async close() {
      await client.end();
    },
  };
};
