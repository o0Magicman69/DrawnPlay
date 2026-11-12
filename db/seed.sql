-- Seed data converted from prev_work/netball.db
-- Create the two teams used by the tactic board.
INSERT INTO teams (team_id, team_colour) VALUES
    (1, 'red'),
    (2, 'blue') ON CONFLICT DO NOTHING;

-- Create seven netball positions for each team.
INSERT INTO players (player_id, position, team_id, team) VALUES
    (1, 'GS', 1, 'red'),
    (2, 'GA', 1, 'red'),
    (3, 'WA', 1, 'red'),
    (4, 'C', 1, 'red'),
    (5, 'WD', 1, 'red'),
    (6, 'GD', 1, 'red'),
    (7, 'GK', 1, 'red'),
    (8, 'GS', 2, 'blue'),
    (9, 'GA', 2, 'blue'),
    (10, 'WA', 2, 'blue'),
    (11, 'C', 2, 'blue'),
    (12, 'WD', 2, 'blue'),
    (13, 'GD', 2, 'blue'),
    (14, 'GK', 2, 'blue') ON CONFLICT DO NOTHING;

-- Store the readable court restrictions used to explain each position's valid zones.
INSERT INTO player_restrictions (restriction_id, player_id, position, restricted_areas, areas_allowed) VALUES
    (1, 1, 'GS', 'Centre and Defensive third', 'Attacking third and goal circle'),
    (2, 2, 'GA', 'Defensive third', 'Centre third and attacking third including goal circle'),
    (3, 3, 'WA', 'Goal circles', 'Centre third and attacking third excluding goal circle'),
    (4, 4, 'C', 'Goal circles', 'All thirds excluding both goal circles'),
    (5, 5, 'WD', 'Attacking goal circle', 'Defensive and centre thirds plus defensive goal circle edge'),
    (6, 6, 'GD', 'Attacking goal circle', 'Defensive and centre thirds plus defensive goal circle'),
    (7, 7, 'GK', 'Centre and attacking thirds', 'Defensive third and defensive goal circle') ON CONFLICT DO NOTHING;

-- Define the roles available to application users.
INSERT INTO roles (role_id, role_name) VALUES
    (1, 'admin'),
    (2, 'coach'),
    (3, 'viewer') ON CONFLICT DO NOTHING;

-- Add the initial example users; these hashes are seed placeholders, not production passwords.
INSERT INTO app_users (user_id, username, password_hash) VALUES
    (1, 'net_admin', 'hash_admin'),
    (2, 'team_coach', 'hash_coach'),
    (3, 'match_viewer', 'hash_viewer') ON CONFLICT DO NOTHING;

-- Define the individual capabilities that roles may receive.
INSERT INTO permissions (permission_id, permission_name) VALUES
    (1, 'players.read'),
    (2, 'players.write'),
    (3, 'restrictions.read'),
    (4, 'restrictions.write'),
    (5, 'teams.read') ON CONFLICT DO NOTHING;

-- Give each role its permitted capabilities.
INSERT INTO role_permissions (role_id, permission_id) VALUES
    (1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
    (2, 1), (2, 3), (2, 5),
    (3, 1), (3, 3), (3, 5) ON CONFLICT DO NOTHING;

-- Connect each example user to one role.
INSERT INTO user_roles (user_id, role_id) VALUES
    (1, 1),
    (2, 2),
    (3, 3) ON CONFLICT DO NOTHING;

