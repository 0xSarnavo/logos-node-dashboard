import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST || "timescaledb",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "logos",
  user: process.env.DB_USER || "logos",
  password: process.env.DB_PASSWORD || "logos_internal_db",
  max: 10,
  idleTimeoutMillis: 30000,
});

export default pool;
