// Capa de base de datos con DOS modos, misma interfaz:
//   - Producción (Vercel): Postgres en Neon, si está DATABASE_URL.
//   - Local (desarrollo): PGlite (Postgres en WASM) persistido en ./.pgdata.
// Las consultas usan `db.query(sql, params)` y son idénticas en ambos.

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __financeDb: Promise<DbClient> | undefined;
}

// ----------------------------- Producción: Neon -----------------------------
async function createNeon(): Promise<DbClient> {
  const { Pool } = await import("@neondatabase/serverless");
  const { readFileSync } = await import("node:fs");
  const path = (await import("node:path")).default;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client: DbClient = {
    query: <T,>(sql: string, params?: unknown[]) =>
      pool.query(sql, params as unknown[]) as unknown as Promise<{ rows: T[] }>,
    exec: async (sql: string) => {
      await pool.query(sql);
    },
  };
  // El esquema base se crea con scripts/setup-db.mjs; aquí solo migraciones
  // idempotentes (seguras), que aplican cambios nuevos sin tocar los datos.
  const migratePath = path.join(process.cwd(), "src", "db", "sql", "migrate.sql");
  await client.exec(readFileSync(migratePath, "utf8"));
  return client;
}

// ----------------------------- Local: PGlite -----------------------------
async function createPGlite(): Promise<DbClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFileSync, mkdirSync } = await import("node:fs");
  const path = (await import("node:path")).default;

  const sqlDir = path.join(process.cwd(), "src", "db", "sql");
  const distDir = path.join(process.cwd(), "node_modules", "@electric-sql", "pglite", "dist");
  const dataDir = process.env.FINAPP_DATA_DIR || path.join(process.cwd(), ".pgdata");

  const [pgliteWasmModule, initdbWasmModule] = await Promise.all([
    WebAssembly.compile(readFileSync(path.join(distDir, "pglite.wasm"))),
    WebAssembly.compile(readFileSync(path.join(distDir, "initdb.wasm"))),
  ]);
  const fsBundle = new Blob([readFileSync(path.join(distDir, "pglite.data"))]);
  mkdirSync(dataDir, { recursive: true });

  const pg = new PGlite({ dataDir, pgliteWasmModule, initdbWasmModule, fsBundle });

  // Aplica el esquema solo la primera vez (base vacía).
  let ready = true;
  try {
    await pg.query("SELECT 1 FROM person LIMIT 1");
  } catch {
    ready = false;
  }
  if (!ready) await pg.exec(readFileSync(path.join(sqlDir, "schema.sql"), "utf8"));
  await pg.exec(readFileSync(path.join(sqlDir, "migrate.sql"), "utf8"));

  return {
    query: <T,>(sql: string, params?: unknown[]) =>
      pg.query<T>(sql, params as unknown[]) as Promise<{ rows: T[] }>,
    exec: (sql: string) => pg.exec(sql).then(() => undefined),
  };
}

export function getDb(): Promise<DbClient> {
  if (!globalThis.__financeDb) {
    globalThis.__financeDb = process.env.DATABASE_URL ? createNeon() : createPGlite();
  }
  return globalThis.__financeDb;
}
