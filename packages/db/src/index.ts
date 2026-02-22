import dotenv from "dotenv";

dotenv.config({
	path: "../../apps/server/.env",
});

import { drizzle } from "drizzle-orm/node-postgres";
import { serverEnv } from "@milkpod/env/server";

export const db = drizzle(serverEnv().DATABASE_URL);
