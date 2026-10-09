import { neon } from "@neondatabase/serverless";

export type SqlRow = Record<string, unknown>;
export type SqlExecutor = (query: string, params: unknown[]) => Promise<SqlRow[]>;

export function createNeonExecutor(databaseUrl = process.env.DATABASE_URL): SqlExecutor {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Neon persistence");

  const sql = neon(databaseUrl);
  return (query, params) => sql.query(query, params) as Promise<SqlRow[]>;
}
