-- PostgreSQL schema for the netball tactic board: players, positions, rules, saved plays and
-- (future) coach/player accounts and permissions. Every statement is idempotent.
CREATE TABLE IF NOT EXISTS teams (
    -- Each team has a stable identifier used by player foreign keys.
    team_id INTEGER PRIMARY KEY,
    team_colour TEXT NOT NULL UNIQUE CHECK (team_colour IN ('red', 'blue'))
);

CREATE TABLE IF NOT EXISTS players (
    -- Each player record represents one position for one team.
    player_id INTEGER PRIMARY KEY,
    position TEXT NOT NULL CHECK (position IN ('GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK')),
    team_id INTEGER NOT NULL REFERENCES teams(team_id),
    team TEXT NOT NULL CHECK (team IN ('red', 'blue')),
    CHECK (
        (team_id = 1 AND team = 'red') OR
        (team_id = 2 AND team = 'blue')
    )
);

CREATE TABLE IF NOT EXISTS player_restrictions (
    -- Store the human-readable movement information for a position.
    restriction_id INTEGER PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(player_id),
    position TEXT NOT NULL CHECK (position IN ('GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK')),
    restricted_areas TEXT NOT NULL,
    areas_allowed TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
    -- Roles group permissions such as admin, coach, and viewer.
    role_id INTEGER PRIMARY KEY,
    role_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS app_users (
    -- Application login records; password_hash is intended for hashed passwords.
    user_id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
    -- Named capabilities that can be assigned to roles.
    permission_id INTEGER PRIMARY KEY,
    permission_name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS role_permissions (
    -- Join table implementing the many-to-many role/permission relationship.
    role_id INTEGER NOT NULL REFERENCES roles(role_id),
    permission_id INTEGER NOT NULL REFERENCES permissions(permission_id),
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    -- Join table implementing the many-to-many user/role relationship.
    user_id INTEGER NOT NULL REFERENCES app_users(user_id),
    role_id INTEGER NOT NULL REFERENCES roles(role_id),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS plays (
    -- A named snapshot of the board saved by one browser (owner_id is a private random ID).
    play_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    ball_x DOUBLE PRECISION NOT NULL,
    ball_y DOUBLE PRECISION NOT NULL,
    owner_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plays_owner ON plays (owner_id);

CREATE TABLE IF NOT EXISTS play_positions (
    -- Where each player stood in a saved play, in the board's 700 x 500 coordinate space.
    play_id INTEGER NOT NULL REFERENCES plays(play_id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(player_id),
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (play_id, player_id)
);

CREATE TABLE IF NOT EXISTS play_paths (
    -- The recorded drag path of each moved marker; player_id is NULL for the ball.
    path_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    play_id INTEGER NOT NULL REFERENCES plays(play_id) ON DELETE CASCADE,
    player_id INTEGER REFERENCES players(player_id),
    seq INTEGER NOT NULL,
    x DOUBLE PRECISION NOT NULL,
    y DOUBLE PRECISION NOT NULL
);

-- Milliseconds on the recording clock; NULL for plays saved before timing was recorded.
ALTER TABLE play_paths ADD COLUMN IF NOT EXISTS t INTEGER;
ALTER TABLE play_paths ADD COLUMN IF NOT EXISTS segment_start BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_play_paths_play ON play_paths (play_id, player_id, seq);

-- Supabase exposes the public schema through a REST API keyed by a public anon key. Enabling row-level
-- security with no policies blocks that API; the app's own database connection (owner role) is unaffected.
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE play_paths ENABLE ROW LEVEL SECURITY;
