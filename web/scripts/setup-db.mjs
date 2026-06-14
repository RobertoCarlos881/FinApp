// Crea el esquema de FinApp en una base Postgres (Neon).
// Uso (una sola vez):  DATABASE_URL="postgres://..." node scripts/setup-db.mjs
import { Pool } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ Falta DATABASE_URL. Ejecuta:");
  console.error('   DATABASE_URL="postgres://..." node scripts/setup-db.mjs');
  process.exit(1);
}

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const schema = read("../src/db/sql/schema.sql");
const migrate = read("../src/db/sql/migrate.sql");

const pool = new Pool({ connectionString: url });
try {
  await pool.query(schema);
  await pool.query(migrate);
  console.log("✅ Esquema de FinApp creado en la base de datos.");
} catch (e) {
  console.error("❌ Error creando el esquema:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
