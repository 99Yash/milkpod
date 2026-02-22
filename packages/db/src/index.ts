import { drizzle } from "drizzle-orm/node-postgres";

let _db: ReturnType<typeof drizzle> | undefined;

export function db() {
	if (!_db) {
		if (!process.env.DATABASE_URL) {
			throw new Error("DATABASE_URL environment variable is not set");
		}
		_db = drizzle(process.env.DATABASE_URL);
	}
	return _db;
}

export async function closeConnections() {
	if (_db) await _db.$client.end();
}
