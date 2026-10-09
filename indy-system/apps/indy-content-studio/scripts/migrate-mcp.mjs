import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (process.argv.includes("--if-enabled") && process.env.INDY_APPLY_MCP_MIGRATIONS !== "1") {
  console.log("MCP migrations disabled for this build.");
} else if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. Use the same Neon database as the dashboard.");
  process.exitCode = 1;
} else {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const migration = await readFile(new URL("../migrations/20261005_mcp_oauth.sql", import.meta.url), "utf8");
    for (const statement of migration.split(";").map((part) => part.trim()).filter(Boolean)) {
      await sql.query(statement);
    }
    console.log("MCP OAuth migration applied. Dashboard data was not modified.");
  } catch {
    console.error("MCP migration failed. Check database access and migration permissions.");
    process.exitCode = 1;
  }
}
