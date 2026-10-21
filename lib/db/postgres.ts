import { Pool } from "pg"

/**
 * The direct Postgres connection.
 *
 * The evaluation aggregates are group-bys, and a group-by that spans a to-many
 * cannot be expressed through the REST API (PostgREST can only group by the
 * top-level table's columns). So the app asks Postgres directly: the SQL lives
 * in this app, as a parameterised query, and the rows come back already
 * grouped.
 *
 * Nothing is created in the database — these are plain SELECTs, so there is no
 * function to install, no schema cache to refresh and no migration to run.
 *
 * The connection is opened lazily, so the module imports without the env var
 * (the test suite and the build never need it) and the error only fires on a
 * real query, naming the variable that is missing.
 */

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error("DATABASE_URL is required for the evaluation aggregates")
    }
    pool = new Pool({
      connectionString,
      // Serverless: a warm instance holds a few connections and the pooler
      // multiplexes them, so the database's connection limit is not this app's
      // problem. With the session pooler (port 5432) keep it at 1.
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    })
  }
  return pool
}

/** Run one parameterised query and return its rows. */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params)
  return result.rows as T[]
}
