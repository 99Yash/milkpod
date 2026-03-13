import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const POOL_MIN = 4;
const POOL_MAX = 10;
const POOL_IDLE_TIMEOUT_MS = 30_000;

let _db: ReturnType<typeof drizzle> | undefined;
let _pool: pg.Pool | undefined;

export function db() {
	if (!_db) {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL environment variable is not set");
		}
		_pool = new pg.Pool({
			connectionString: process.env.DATABASE_URL,
			min: POOL_MIN,
			max: POOL_MAX,
			idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
		});
		_db = drizzle(_pool);
	}
	return _db;
}

/**
 * Pre-warm the connection pool so the first requests don't pay
 * the TCP + SSL + auth handshake cost (~2-3 s to Neon).
 * Call once at server startup — best-effort, failures are non-fatal.
 */
export async function warmPool() {
	db(); // ensure pool is created
	if (_pool) {
		try {
			const clients = await Promise.all(
				Array.from({ length: POOL_MIN }, () => _pool!.connect()),
			);
			for (const c of clients) c.release();
		} catch (err) {
			console.warn(
				"[db] Pool warm-up failed, connections will be established lazily:",
				err instanceof Error ? err.message : String(err),
			);
		}
	}
}

export async function closeConnections() {
	if (_pool) await _pool.end();
}
