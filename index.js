// Express provides the HTTP server and routing used by the browser application.
const express = require("express");
// Node's path helper creates platform-safe paths on Windows, macOS, and Linux.
const path = require("path");
// The database module connects to PostgreSQL and creates the tables on first start.
const { loadDatabase } = require("./db/database");

// Create the Express application; the database pool is opened before the server starts listening.
const app = express();
let db;
// Use the hosting environment's port when provided, otherwise use port 3000 locally.
const PORT = process.env.PORT || 3000;

// Express 4 does not catch rejected promises, so async handlers are wrapped to reach the error handler.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Serve index.html, JavaScript, and CSS from the public folder.
app.use(express.static(path.join(__dirname, "public")));
// Parse JSON request bodies for future write endpoints.
app.use(express.json({ limit: "1mb" }));

// Netball position zone rules, converted from prev_work/tactic_board.py `self.positions`
const POSITION_ZONES = {
    GS: ["goal_third_attack"],
    GA: ["goal_third_attack", "center_third"],
    WA: ["center_third", "goal_third_attack"],
    C: ["center_third", "goal_third_attack", "goal_third_defense"],
    WD: ["center_third", "goal_third_defense"],
    GD: ["goal_third_defense", "center_third"],
    GK: ["goal_third_defense"],
};

app.get("/api/teams", wrap(async (req, res) => {
    // Return the two seeded teams as JSON for the frontend or other clients.
    const { rows } = await db.query("SELECT * FROM teams ORDER BY team_id");
    res.json(rows);
}));

app.get("/api/players", wrap(async (req, res) => {
    // Join players to their restrictions so one response contains all board data.
    const { rows } = await db.query(
        `SELECT p.player_id, p.position, p.team, pr.restricted_areas, pr.areas_allowed
         FROM players p
         LEFT JOIN player_restrictions pr ON pr.player_id = p.player_id
         ORDER BY p.player_id`
    );
    // Add the movement zones used by the canvas validation logic.
    res.json(rows.map((p) => ({ ...p, zones: POSITION_ZONES[p.position] || [] })));
}));

app.get("/api/plays", requireOwner, wrap(async (req, res) => {
    // List this owner's saved plays, newest first, with how many players each one stores.
    const { rows } = await db.query(
        `SELECT p.play_id, p.name,
                to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS created_at,
                COUNT(pp.player_id)::int AS player_count
         FROM plays p
         LEFT JOIN play_positions pp ON pp.play_id = p.play_id
         WHERE p.owner_id = $1
         GROUP BY p.play_id
         ORDER BY p.created_at DESC, p.play_id DESC`,
        [req.ownerId]
    );
    res.json(rows);
}));

// Plays are addressed by integer ID; anything else is simply "not found".
function parsePlayId(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
        res.status(404).json({ error: "Play not found." });
        return null;
    }
    return id;
}

app.get("/api/plays/:id", requireOwner, wrap(async (req, res) => {
    const id = parsePlayId(req, res);
    if (id === null) return;
    const { rows: [play] } = await db.query("SELECT * FROM plays WHERE play_id = $1 AND owner_id = $2", [id, req.ownerId]);
    if (!play) return res.status(404).json({ error: "Play not found." });
    const { rows: players } = await db.query("SELECT player_id, x, y FROM play_positions WHERE play_id = $1", [id]);
    // Rebuild the recorded paths: one list per moved player plus one for the ball.
    const paths = { players: {}, ball: [] };
    const { rows: points } = await db.query(
        "SELECT player_id, x, y, t, segment_start FROM play_paths WHERE play_id = $1 ORDER BY player_id, seq",
        [id]
    );
    points.forEach((row) => {
        const pt = row.t === null ? { x: row.x, y: row.y } : { x: row.x, y: row.y, t: row.t };
        if (row.segment_start) pt.start = true;
        if (row.player_id === null) paths.ball.push(pt);
        else (paths.players[row.player_id] ||= []).push(pt);
    });
    res.json({
        play_id: play.play_id,
        name: play.name,
        created_at: play.created_at,
        players,
        ball: { x: play.ball_x, y: play.ball_y },
        paths,
    });
}));

// Plays belong to the browser that saved them, identified by a private random ID sent in x-owner-id.
function requireOwner(req, res, next) {
    const id = req.get("x-owner-id") || "";
    if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) {
        return res.status(400).json({ error: "Missing owner ID." });
    }
    req.ownerId = id;
    next();
}

app.post("/api/plays", requireOwner, wrap(async (req, res) => {
    const { name, players, ball, paths } = req.body || {};
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed || trimmed.length > 60) {
        return res.status(400).json({ error: "Name must be 1-60 characters." });
    }
    const isNum = (v) => typeof v === "number" && Number.isFinite(v);
    if (!Array.isArray(players) || players.length === 0 || players.length > 14 ||
        !players.every((p) => Number.isInteger(p.player_id) && isNum(p.x) && isNum(p.y)) ||
        !ball || !isNum(ball.x) || !isNum(ball.y)) {
        return res.status(400).json({ error: "Invalid play data." });
    }
    const { rows: knownRows } = await db.query("SELECT player_id FROM players");
    const known = new Set(knownRows.map((r) => r.player_id));
    if (!players.every((p) => known.has(p.player_id))) {
        return res.status(400).json({ error: "Unknown player in play." });
    }

    // Paths are optional so plays without movement can still be saved.
    const MAX_POINTS = 300;
    const validPath = (list) =>
        Array.isArray(list) && list.length <= MAX_POINTS &&
        list.every((pt, i) => pt && isNum(pt.x) && isNum(pt.y) &&
            (pt.t === undefined || (isNum(pt.t) && pt.t >= 0 && pt.t <= 3600000)) &&
            (i === 0 || ((pt.t === undefined) === (list[i - 1].t === undefined) &&
                (pt.t === undefined || pt.t >= list[i - 1].t))) &&
            (pt.start === undefined || typeof pt.start === "boolean"));
    const playerPaths = (paths && paths.players) || {};
    const ballPath = (paths && paths.ball) || [];
    const pathIds = Object.keys(playerPaths);
    if (!validPath(ballPath) ||
        !pathIds.every((id) => known.has(Number(id)) && validPath(playerPaths[id]))) {
        return res.status(400).json({ error: "Invalid path data." });
    }

    // Save the play and its positions together so a failure never leaves a partial play.
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const { rows: [created] } = await client.query(
            "INSERT INTO plays (name, ball_x, ball_y, owner_id) VALUES ($1, $2, $3, $4) RETURNING play_id",
            [trimmed, ball.x, ball.y, req.ownerId]
        );
        const playId = created.play_id;
        await client.query(
            `INSERT INTO play_positions (play_id, player_id, x, y)
             SELECT $1, * FROM unnest($2::int[], $3::float8[], $4::float8[])`,
            [playId, players.map((p) => p.player_id), players.map((p) => p.x), players.map((p) => p.y)]
        );
        // Flatten ball (null player) and per-player paths into parallel arrays for one bulk insert.
        const tOf = (pt) => (pt.t === undefined ? null : Math.round(pt.t));
        const rows = ballPath.map((pt, i) => [null, i, pt.x, pt.y, tOf(pt), pt.start === true]);
        pathIds.forEach((id) => playerPaths[id].forEach((pt, i) => rows.push([Number(id), i, pt.x, pt.y, tOf(pt), pt.start === true])));
        if (rows.length) {
            await client.query(
                `INSERT INTO play_paths (play_id, player_id, seq, x, y, t, segment_start)
                 SELECT $1, * FROM unnest($2::int[], $3::int[], $4::float8[], $5::float8[], $6::int[], $7::boolean[])`,
                [playId, ...[0, 1, 2, 3, 4, 5].map((c) => rows.map((r) => r[c]))]
            );
        }
        await client.query("COMMIT");
        res.status(201).json({ play_id: playId, name: trimmed });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}));

app.delete("/api/plays/:id", requireOwner, wrap(async (req, res) => {
    const id = parsePlayId(req, res);
    if (id === null) return;
    const result = await db.query("DELETE FROM plays WHERE play_id = $1 AND owner_id = $2", [id, req.ownerId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Play not found." });
    res.status(204).end();
}));

// Simple health check for host monitoring.
app.get("/healthz", wrap(async (req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
}));

// Unexpected errors (for example a database outage) return a generic message instead of internals.
app.use((error, req, res, next) => {
    // Malformed JSON and oversized bodies carry their own 4xx status.
    if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: "Bad request." });
    console.error(error);
    res.status(500).json({ error: "Server error." });
});

loadDatabase()
    .then((pool) => {
        db = pool;
        app.listen(PORT, () => {
            // This callback runs once the database is ready and the server accepts browser requests.
            console.log(`Netball tactic board running at http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Could not start: database connection failed.", error.message);
        process.exit(1);
    });