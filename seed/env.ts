import { config } from "dotenv";

// Must be imported before anything that reads process.env.DATABASE_URL
// (like src/lib/db, which throws at import time if it's unset).
config({ path: ".env.local" });
config();
