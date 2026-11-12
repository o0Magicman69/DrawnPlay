// node-postgres provides a connection pool for the hosted PostgreSQL database.
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Hosts (Neon, Supabase, Render, Railway) provide DATABASE_URL; the fallback is a local dev database.
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/netball";

function useSsl(url) {
    // Local databases usually have no TLS; hosted ones require it unless the URL says otherwise.
    if (/sslmode=/.test(url) || process.env.PGSSLMODE) return undefined;
    return /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : { rejectUnauthorized: false };
}

async function loadDatabase() {
    const pool = new Pool({ connectionString: DATABASE_URL, ssl: useSsl(DATABASE_URL) });
    // Idle connections can be dropped by the host; log it instead of crashing the process.
    pool.on("error", (error) => console.error("Database connection error:", error.message));

    // Every statement in schema.sql is IF NOT EXISTS, so running it on each start is safe.
    await pool.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

    // Seed the reference data (teams, players, rules, roles) only into an empty database.
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM teams");
    if (rows[0].n === 0) {
        await pool.query(fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8"));
    }
    return pool;
}

module.exports = { loadDatabase };
