// Get the canvas element that displays the court and players.
const canvas = document.getElementById("court");
// Get the 2D drawing API used for all court and player graphics.
const ctx = canvas.getContext("2d");
// Get the element used to show invalid-movement messages.
const statusEl = document.getElementById("status");
// These controls let users save the current board and choose a saved JSON file.
const addBallButton = document.getElementById("add-ball");
const savePlayButton = document.getElementById("save-play");
const loadPlayButton = document.getElementById("load-play");
const resetBoardButton = document.getElementById("reset-board");
const togglePlaybackButton = document.getElementById("toggle-playback");
const restartPlaybackButton = document.getElementById("restart-playback");
const saveVideoButton = document.getElementById("save-video");
const teamButtons = {
    red: document.getElementById("toggle-red"),
    blue: document.getElementById("toggle-blue"),
};
const playFileInput = document.getElementById("play-file");
const playsModal = document.getElementById("plays-modal");
const playsList = document.getElementById("plays-list");
const closePlaysButton = document.getElementById("close-plays");
const openFileButton = document.getElementById("open-file");
const downloadFileButton = document.getElementById("download-file");
const playNameInput = document.getElementById("play-name");
const saveCurrentButton = document.getElementById("save-current");

// All game coordinates live in a fixed 700 x 500 space; the canvas is stretched to fill the window.
const LOGICAL_W = canvas.width;
const LOGICAL_H = canvas.height;
let scaleX = 1;
let scaleY = 1;

// Keep the court dimensions in one place so drawing and validation use the same boundaries.
const MARGIN = 20;
const COURT_W = LOGICAL_W - MARGIN * 2;
const COURT_H = LOGICAL_H - MARGIN * 2;
// These are the x-coordinates where the court changes from one third to the next.
const THIRD_1 = MARGIN + COURT_W / 3; // defense/center boundary
const THIRD_2 = MARGIN + (2 * COURT_W) / 3; // center/attack boundary

// The database stores team names; these colors are used when drawing their markers.
const TEAM_COLORS = { red: "#FF0000", blue: "#0066CC" };
// All player markers use the same radius for reliable hit detection.
const RADIUS = 18;
// Make selection forgiving while still choosing the closest marker when players are close together.
const HIT_RADIUS = 26;
// The ball is smaller than a player marker so both can occupy the centre circle.
const BALL_RADIUS = 11;
// Keep the goal circles prominent at both ends of the full court.
const GOAL_CIRCLE_RADIUS = 125;

// Starting layout: red attacks left / defends right, blue attacks right / defends left
// Coordinates are based on the 700 x 500 canvas size in index.html.
const START_POSITIONS = {
    red: {
        GS: { x: 70, y: 210 }, GK: { x: 630, y: 232 },
        GA: { x: 218, y: 136 }, GD: { x: 480, y: 304 },
        WA: { x: 218, y: 300 }, WD: { x: 480, y: 177 },
        C: { x: 350, y: 250 },
    },
    blue: {
        GS: { x: 630, y: 267 }, GK: { x: 70, y: 260 },
        GA: { x: 480, y: 340 }, GD: { x: 218, y: 173 },
        WA: { x: 480, y: 216 }, WD: { x: 218, y: 343 },
        C: { x: 280, y: 250 },
    },
};

// The current positions loaded from the API and changed by dragging.
let players = [];
// The ball starts in the centre circle and can be moved independently of players.
// The ball starts slightly off the red Centre player so both can be grabbed.
const BALL_START = { x: 350, y: 238 };
let ball = { x: BALL_START.x, y: BALL_START.y, highlight: false };
// The player currently being dragged, or null when no drag is active.
let selected = null;
// Identifies whether the selected object is a player or the ball.
let selectedType = null;
// Preserve the point where the user grabbed a marker so it does not jump while dragging.
let dragOffset = { x: 0, y: 0 };

// Teams can be removed from or added back to the board; hidden teams are not drawn or draggable.
const teamVisible = { red: true, blue: true };

// Trails record every drag and are always shown until the board is reset.
// Maps player_id to a list of {x, y, t} points, where t is milliseconds on the recording clock.
const playerTrails = new Map();
let ballTrail = [];

// Recording clock state: lets playback reproduce the real timing of every drag.
const IDLE_GAP_MS = 400;
let clockBase = 0;
let clockDownAt = 0;
let clockLastT = 0;
let clockLastUp = null;

// Each team attacks the third on its own side, and defends the opposite side
function zoneAt(x, team) {
    // First determine which physical third contains the supplied x-coordinate.
    const inLeftThird = x <= THIRD_1;
    const inRightThird = x > THIRD_2;
    // The middle third has the same meaning for both teams.
    if (!inLeftThird && !inRightThird) return "center_third";
    // Red attacks left; blue attacks right, so the outer thirds are team-relative.
    const inAttackThird = team === "red" ? inLeftThird : inRightThird;
    return inAttackThird ? "goal_third_attack" : "goal_third_defense";
}

function isValidPosition(player) {
    // A move is valid when the player's position rules include the third being occupied.
    return player.zones.includes(zoneAt(player.x, player.team));
}

function circlePath(x, y, r, start = 0, end = Math.PI * 2) {
    // The canvas is stretched non-uniformly, so compensate to keep circles round.
    const s = Math.min(scaleX, scaleY);
    ctx.ellipse(x, y, (r * s) / scaleX, (r * s) / scaleY, 0, start, end);
}

function fillTextRound(text, x, y) {
    // Undo the stretch for text so letters are not distorted.
    const s = Math.min(scaleX, scaleY);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / scaleX, s / scaleY);
    ctx.fillText(text, 0, 0);
    ctx.restore();
}

function resizeCanvas() {
    // Match the drawing buffer to the window so the court covers the whole screen.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scaleX = canvas.width / LOGICAL_W;
    scaleY = canvas.height / LOGICAL_H;
    render();
}

function drawWoodgrain() {
    // Start with a warm varnished timber base.
    const wood = ctx.createLinearGradient(0, 0, LOGICAL_W, 0);
    wood.addColorStop(0, "#a85f32");
    wood.addColorStop(0.2, "#d28a4f");
    wood.addColorStop(0.5, "#b8703d");
    wood.addColorStop(0.78, "#d89458");
    wood.addColorStop(1, "#965329");
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Add irregular horizontal grain so the surface does not look like a flat gradient.
    for (let y = 8; y < LOGICAL_H; y += 13) {
        ctx.beginPath();
        for (let x = 0; x <= LOGICAL_W; x += 18) {
            const wave = Math.sin(x * 0.035 + y * 0.11) * 2.5;
            if (x === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
        }
        ctx.strokeStyle = y % 39 === 0 ? "rgba(76, 35, 14, 0.24)" : "rgba(255, 205, 137, 0.18)";
        ctx.lineWidth = y % 39 === 0 ? 2 : 1;
        ctx.stroke();
    }

    // Draw a few long darker seams to suggest joined timber boards.
    ctx.strokeStyle = "rgba(76, 35, 14, 0.16)";
    ctx.lineWidth = 2;
    [145, 338, 542].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(180, y - 5, 430, y + 7, LOGICAL_W, y - 2);
        ctx.stroke();
    });
}

function drawCourt() {
    // Clear the previous frame before redrawing the court and all markers.
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
    // Paint the timber surface first so court lines and players appear above it.
    drawWoodgrain();

    // Draw the outside boundary of the playing area.
    ctx.strokeStyle = "white";
    ctx.lineWidth = 3;
    ctx.strokeRect(MARGIN, MARGIN, COURT_W, COURT_H);

    // Draw the two lines that divide the court into three equal thirds.
    ctx.lineWidth = 2;
    [THIRD_1, THIRD_2].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, MARGIN);
        ctx.lineTo(x, MARGIN + COURT_H);
        ctx.stroke();
    });

    // Draw the centre circle in the middle third.
    const cx = MARGIN + COURT_W / 2;
    const cy = MARGIN + COURT_H / 2;
    ctx.beginPath();
    circlePath(cx, cy, 20);
    ctx.stroke();

    // Draw the visible halves of the two goal circles at either end.
    ctx.beginPath();
    circlePath(MARGIN, cy, GOAL_CIRCLE_RADIUS, Math.PI * 1.5, Math.PI * 2.5);
    ctx.stroke();
    ctx.beginPath();
    circlePath(MARGIN + COURT_W, cy, GOAL_CIRCLE_RADIUS, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    // Add labels so users can identify each third while arranging players.
    ctx.fillStyle = "white";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    fillTextRound("Goal Third", MARGIN + COURT_W / 6, MARGIN + 25);
    fillTextRound("Centre Third", cx, MARGIN + 25);
    fillTextRound("Goal Third", MARGIN + (5 * COURT_W) / 6, MARGIN + 25);
}

function drawPlayers() {
    // Redraw every player from the current in-memory position.
    for (const p of players) {
        if (!teamVisible[p.team]) continue;
        // Draw the circular team marker.
        ctx.beginPath();
        circlePath(p.x, p.y, RADIUS);
        ctx.fillStyle = TEAM_COLORS[p.team];
        ctx.fill();
        ctx.lineWidth = p.highlight ? 4 : 2;
        ctx.strokeStyle = p.highlight || "white";
        ctx.stroke();

        // Draw the position abbreviation in the centre of the marker.
        ctx.fillStyle = "white";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fillTextRound(p.position, p.x, p.y);
    }
}

function drawBall() {
    // Draw the ball after players so it remains visible when it overlaps a marker.
    ctx.beginPath();
    circlePath(ball.x, ball.y, BALL_RADIUS);
    ctx.fillStyle = "#f28c28";
    ctx.fill();
    ctx.lineWidth = ball.highlight ? 4 : 2;
    ctx.strokeStyle = ball.highlight ? "yellow" : "#32170a";
    ctx.stroke();
}

function drawTrailLine(points, color, width, arrow) {
    if (points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const pt of points.slice(1)) ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    if (!arrow) return;
    // Arrow head on the last segment that has a measurable direction.
    const end = points[points.length - 1];
    const prev = [...points].reverse().find((pt) => Math.hypot(end.x - pt.x, end.y - pt.y) > 4);
    if (!prev) return;
    const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 14 * Math.cos(angle - Math.PI / 6), end.y - 14 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - 14 * Math.cos(angle + Math.PI / 6), end.y - 14 * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function drawTrails() {
    // Trails are drawn above the court but beneath the markers.
    for (const p of players) {
        if (!teamVisible[p.team]) continue;
        drawTrailLine(playerTrails.get(p.player_id) || [], TEAM_COLORS[p.team], 3, false);
    }
    drawTrailLine(ballTrail, "darkorange", 3, true);
}

function render() {
    // Rendering is deliberately simple: redraw the background, then redraw all players.
    drawCourt();
    drawTrails();
    drawPlayers();
    drawBall();
}

function playerAt(x, y) {
    // Choose the closest marker so nearby goal players do not block one another.
    return players.reduce((closest, player) => {
        if (!teamVisible[player.team]) return closest;
        const distance = Math.hypot(player.x - x, player.y - y);
        if (distance > HIT_RADIUS) return closest;
        if (!closest || distance < closest.distance) return { player, distance };
        return closest;
    }, null)?.player || null;
}

function ballAt(x, y) {
    // Keep the hit area close to the ball so the nearby Centre marker remains selectable.
    return Math.hypot(ball.x - x, ball.y - y) <= BALL_RADIUS + 3;
}

function getCanvasPos(evt) {
    // Convert browser coordinates into the canvas's internal coordinate system.
    const rect = canvas.getBoundingClientRect();
    // Pointer events normally use clientX/clientY; the touch fallback supports touch input.
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
        x: ((clientX - rect.left) * LOGICAL_W) / rect.width,
        y: ((clientY - rect.top) * LOGICAL_H) / rect.height,
    };
}

canvas.addEventListener("pointerdown", (evt) => {
    // Prevent browser text selection or native drag behavior from taking over.
    evt.preventDefault();
    // A click during playback pauses it; clicking again while paused hands the board back for dragging.
    if (playback) {
        if (!playback.paused) togglePlayback();
        else {
            discardPlayback();
            statusEl.textContent = "Playback ended. The board is yours.";
        }
        return;
    }
    // Begin a drag only when the pointer starts on a player marker or the ball.
    const pos = getCanvasPos(evt);
    const p = playerAt(pos.x, pos.y);
    const isBallSelected = ballAt(pos.x, pos.y);
    const playerDistance = p ? Math.hypot(p.x - pos.x, p.y - pos.y) : Infinity;
    const ballDistance = isBallSelected ? Math.hypot(ball.x - pos.x, ball.y - pos.y) : Infinity;
    if (p || isBallSelected) {
        // Store the selected object and the grab offset for smooth movement.
        selectedType = ballDistance < playerDistance ? "ball" : "player";
        selected = selectedType === "ball" ? ball : p;
        // Keep receiving movement even when an edge player is dragged outside the canvas briefly.
        canvas.setPointerCapture(evt.pointerId);
        dragOffset.x = pos.x - selected.x;
        dragOffset.y = pos.y - selected.y;
        selected.highlight = "yellow";
        const start = { x: selected.x, y: selected.y, start: true };
        // Time of this drag on the recording clock; idle time between drags is shortened so plays stay watchable.
        const trailsEmpty = playerTrails.size === 0 && ballTrail.length === 0;
        const downAt = performance.now();
        clockBase = trailsEmpty || clockLastUp === null ? 0 : clockLastT + Math.min(downAt - clockLastUp, IDLE_GAP_MS);
        clockDownAt = downAt;
        clockLastT = clockBase;
        start.t = clockBase;
        if (selectedType === "ball") ballTrail.push(start);
        else {
            if (!playerTrails.has(selected.player_id)) playerTrails.set(selected.player_id, []);
            playerTrails.get(selected.player_id).push(start);
        }
        render();
    }
});

window.addEventListener("pointermove", (evt) => {
    // Prevent scrolling or other browser gestures while a player is being moved.
    if (selected) evt.preventDefault();
    // Ignore pointer movement when the user is not dragging a player.
    if (!selected) return;
    const pos = getCanvasPos(evt);
    // Update the selected object's coordinates and redraw the frame.
    selected.x = pos.x - dragOffset.x;
    selected.y = pos.y - dragOffset.y;
    clockLastT = clockBase + (performance.now() - clockDownAt);
    const point = { x: selected.x, y: selected.y, t: clockLastT };
    if (selectedType === "ball") ballTrail.push(point);
    else playerTrails.get(selected.player_id).push(point);
    render();
});

function endDrag() {
    // Pointer-up and pointer-leave can both fire without an active selection.
    if (!selected) return;
    const item = selected;
    // Only players have zone restrictions; the ball can travel anywhere on the court.
    if (selectedType === "player" && !isValidPosition(item)) {
        item.highlight = "red";
        render();
        statusEl.textContent = `${item.team.toUpperCase()} ${item.position} is outside its allowed zone!`;
        // Remove the warning highlight after a short visual notification.
        setTimeout(() => {
            item.highlight = null;
            render();
        }, 1000);
    } else {
        item.highlight = false;
        statusEl.textContent = "";
        render();
    }
    selected = null;
    selectedType = null;
    clockLastUp = performance.now();
}

window.addEventListener("pointerup", (evt) => {
    endDrag();
    if (canvas.hasPointerCapture(evt.pointerId)) canvas.releasePointerCapture(evt.pointerId);
});
window.addEventListener("pointercancel", endDrag);

function savePlayToFile() {
    // Keep only the data needed to restore a play, not temporary drawing state.
    const play = {
        format: "netball-tactic-play",
        version: 1,
        savedAt: new Date().toISOString(),
        canvas: { width: LOGICAL_W, height: LOGICAL_H },
        players: players.map(({ player_id, position, team, x, y }) => ({
            player_id,
            position,
            team,
            x,
            y,
        })),
        ball: { x: ball.x, y: ball.y },
    };

    // Convert the play into a downloadable JSON file without needing server storage.
    const file = new Blob([JSON.stringify(play, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `netball-play-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
    statusEl.textContent = "Play saved to a JSON file.";
}

function applyPlay(savedPlay) {
    stopPlayback();
    // Match saved coordinates to the players already supplied by the database.
    const savedById = new Map(savedPlay.players.map((player) => [player.player_id, player]));
    players.forEach((player) => {
        const saved = savedById.get(player.player_id);
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
            player.x = saved.x;
            player.y = saved.y;
            player.highlight = null;
        }
    });
    if (savedPlay.ball && Number.isFinite(savedPlay.ball.x) && Number.isFinite(savedPlay.ball.y)) {
        ball.x = savedPlay.ball.x;
        ball.y = savedPlay.ball.y;
    }
    // Old trails belong to the previous arrangement.
    playerTrails.clear();
    ballTrail = [];
    render();
}

function loadPlayFromFile(file) {
    // FileReader reads the selected local file without uploading it anywhere.
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const savedPlay = JSON.parse(reader.result);
            if (savedPlay.format !== "netball-tactic-play" || !Array.isArray(savedPlay.players)) {
                throw new Error("This is not a Netball Tactic Board play file.");
            }
            applyPlay(savedPlay);
            // A file holds no recorded movement, so there is nothing to play back.
            lastPlay = null;
            updatePlaybackButtons();
            statusEl.textContent = "Play loaded from file.";
            closePlaysModal();
        } catch (error) {
            statusEl.textContent = `Could not load play: ${error.message}`;
        }
    };
    reader.readAsText(file);
}

function samplePath(points, max = 150) {
    const required = new Set();
    for (const [start, end] of PlaybackPaths.segments(points)) {
        required.add(start);
        required.add(end);
    }
    if (required.size > 300) throw new Error("Too many separate movements to save; reset the board and use fewer movements.");
    const limit = Math.min(points.length, Math.max(max, required.size));
    const remaining = points.map((_, i) => i).filter((i) => !required.has(i));
    const slots = limit - required.size;
    for (let i = 0; i < slots; i++) {
        required.add(remaining[Math.floor((i + 0.5) * remaining.length / slots)]);
    }
    return [...required].sort((a, b) => a - b).map((i) => {
        const pt = points[i];
        return {
            x: pt.x,
            y: pt.y,
            ...(Number.isFinite(pt.t) ? { t: Math.round(pt.t) } : {}),
            ...(pt.start ? { start: true } : {}),
        };
    });
}

async function savePlayToDatabase() {
    const name = playNameInput.value.trim();
    if (!name) {
        statusEl.textContent = "Enter a name for the play first.";
        playNameInput.focus();
        return;
    }
    try {
        const paths = { players: {}, ball: samplePath(ballTrail) };
        for (const [id, points] of playerTrails) paths.players[id] = samplePath(points);
        const res = await ownerFetch("/api/plays", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                players: players.map(({ player_id, x, y }) => ({ player_id, x, y })),
                ball: { x: ball.x, y: ball.y },
                paths,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed.");
        statusEl.textContent = `Play "${data.name}" saved.`;
        playNameInput.value = "";
        refreshPlaysList();
    } catch (error) {
        statusEl.textContent = `Could not save play: ${error.message}`;
    }
}

async function refreshPlaysList() {
    playsList.replaceChildren();
    try {
        const res = await ownerFetch("/api/plays");
        const plays = await res.json();
        if (!plays.length) {
            const empty = document.createElement("li");
            empty.textContent = "No saved plays yet.";
            playsList.append(empty);
            return;
        }
        for (const play of plays) {
            const item = document.createElement("li");
            const label = document.createElement("span");
            label.className = "play-name";
            // textContent keeps user-supplied names from being treated as HTML.
            label.textContent = play.name;
            const when = document.createElement("small");
            when.textContent = `${play.created_at} UTC`;
            label.append(when);

            const playBtn = document.createElement("button");
            playBtn.type = "button";
            playBtn.textContent = "Play";
            playBtn.addEventListener("click", () => playSavedPlay(play.play_id));

            const loadBtn = document.createElement("button");
            loadBtn.type = "button";
            loadBtn.textContent = "Load";
            loadBtn.addEventListener("click", () => loadPlayFromDatabase(play.play_id));

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.textContent = "Delete";
            deleteBtn.addEventListener("click", () => deletePlay(play, deleteBtn));

            item.append(label, playBtn, loadBtn, deleteBtn);
            playsList.append(item);
        }
    } catch (error) {
        const failed = document.createElement("li");
        failed.textContent = "Could not load the list of plays.";
        playsList.append(failed);
    }
}

// Playback: markers follow their recorded timestamps; old plays without timing fall back to a fixed duration.
const PLAYBACK_MS = 7000;
// The ball covers more ground than any player, so its path takes this many times longer.
const BALL_SLOWDOWN = 1.5;
let playback = null;
// The most recently played saved play, kept so it can be replayed on demand.
let lastPlay = null;

function updatePlaybackButtons() {
    // The controls only appear once a saved play has been loaded.
    togglePlaybackButton.hidden = !lastPlay;
    restartPlaybackButton.hidden = !lastPlay;
    saveVideoButton.hidden = !lastPlay;
    if (!playback) togglePlaybackButton.textContent = "Play";
    else togglePlaybackButton.textContent = playback.paused ? "Resume" : "Pause";
}

function stopPlayback() {
    if (!playback) return;
    cancelAnimationFrame(playback.frame);
    // Jump to the final state so the board matches the saved play.
    playback.step(playback.total);
    clockLastT = playback.total;
    clockLastUp = performance.now();
    playback = null;
    finishRecording();
    updatePlaybackButtons();
}

function discardPlayback() {
    // Leave the board exactly where playback was paused.
    if (!playback) return;
    cancelAnimationFrame(playback.frame);
    clockLastT = playback.elapsed;
    clockLastUp = performance.now();
    playback = null;
    finishRecording();
    updatePlaybackButtons();
}

// Video export: the canvas is recorded while the saved play runs, then downloaded.
let recorder = null;

function finishRecording() {
    if (!recorder) return;
    const active = recorder;
    recorder = null;
    // A short pause lets the final frame reach the recording.
    setTimeout(() => active.stop(), 300);
}

function saveVideo() {
    if (!lastPlay || recorder) return;
    if (!canvas.captureStream || !window.MediaRecorder) {
        statusEl.textContent = "Video saving is not supported in this browser.";
        return;
    }
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
    const chunks = [];
    const active = new MediaRecorder(canvas.captureStream(30), mimeType ? { mimeType } : undefined);
    active.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
    };
    active.onstop = () => {
        const type = active.mimeType || "video/webm";
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob(chunks, { type }));
        link.download = `${lastPlay.name.replace(/[^\w-]+/g, "_") || "play"}.${type.includes("mp4") ? "mp4" : "webm"}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        saveVideoButton.disabled = false;
        statusEl.textContent = "Video saved.";
    };
    recorder = active;
    saveVideoButton.disabled = true;
    active.start();
    if (!startPlayback(lastPlay)) {
        recorder = null;
        active.stop();
        saveVideoButton.disabled = false;
        return;
    }
    statusEl.textContent = "Recording video…";
}

function startPlayback(play) {
    // Restarting mid-recording would end the video early, so only stop playback outside a recording.
    const keepRecorder = recorder;
    recorder = null;
    stopPlayback();
    recorder = keepRecorder;
    // Moving markers need at least two points; the rest simply stay at their saved spot.
    const items = [];
    for (const p of players) {
        const path = play.paths.players[p.player_id];
        if (path && path.length >= 2) {
            items.push({ obj: p, path: PlaybackPaths.withTimes(path, PLAYBACK_MS), key: p.player_id });
        }
    }
    if (play.paths.ball.length >= 2) {
        const stationary = play.players.filter((p) => !items.some((item) => item.key === p.player_id));
        const path = PlaybackPaths.synchronizeBall(
            PlaybackPaths.withTimes(play.paths.ball, PLAYBACK_MS * BALL_SLOWDOWN),
            items.map((item) => item.path),
            stationary,
            RADIUS + BALL_RADIUS
        );
        items.push({ obj: ball, path, ball: true });
    }
    if (!items.length) {
        statusEl.textContent = `"${play.name}" has no recorded movement to play back.`;
        return false;
    }

    applyPlay(play);
    closePlaysModal();
    lastPlay = play;

    const timed = (item) => item.path.every((pt) => Number.isFinite(pt.t));
    const place = (item, elapsed) => {
        if (timed(item)) {
            // Real timing: find the segment containing the elapsed time and blend inside it.
            const path = item.path;
            let i = 0;
            while (i < path.length - 2 && path[i + 1].t <= elapsed) i++;
            const a = path[i];
            const b = path[i + 1];
            const span = b.t - a.t;
            const frac = span > 0 ? Math.min(Math.max((elapsed - a.t) / span, 0), 1) : (elapsed < a.t ? 0 : 1);
            item.obj.x = a.x + (b.x - a.x) * frac;
            item.obj.y = a.y + (b.y - a.y) * frac;
            return frac >= 1 ? i + 1 : i;
        }
        // Older plays have no timestamps, so spread the path evenly over a fixed duration.
        const t = Math.min(elapsed / (PLAYBACK_MS * (item.ball ? BALL_SLOWDOWN : 1)), 1);
        const pos = t * (item.path.length - 1);
        const i = Math.min(Math.floor(pos), item.path.length - 2);
        const frac = Math.min(pos - i, 1);
        const a = item.path[i];
        const b = item.path[i + 1];
        item.obj.x = a.x + (b.x - a.x) * frac;
        item.obj.y = a.y + (b.y - a.y) * frac;
        return Math.min(i + 1, item.path.length - 1);
    };
    const step = (elapsed) => {
        for (const item of items) {
            const upTo = place(item, elapsed);
            // Reveal the trail up to the marker's current position.
            const drawn = item.path.slice(0, upTo + 1).map((point) => ({
                ...point,
                t: Math.min(point.t, elapsed),
            }));
            const last = drawn[drawn.length - 1];
            if (last.x !== item.obj.x || last.y !== item.obj.y) {
                drawn.push({ x: item.obj.x, y: item.obj.y, t: elapsed });
            }
            if (item.ball) ballTrail = drawn;
            else playerTrails.set(item.key, drawn);
        }
        render();
    };

    const total = Math.max(
        500,
        ...items.map((item) =>
            timed(item) ? item.path[item.path.length - 1].t : PLAYBACK_MS * (item.ball ? BALL_SLOWDOWN : 1)
        )
    );
    const state = { step, total, elapsed: 0, last: null, paused: false, frame: 0 };
    const tick = (now) => {
        if (playback !== state) return;
        // Only advance the clock while playing so pausing freezes progress.
        if (!state.paused && state.last !== null) state.elapsed += now - state.last;
        state.last = now;
        if (!state.paused) step(state.elapsed);
        if (state.elapsed < total) {
            state.frame = requestAnimationFrame(tick);
        } else {
            clockLastT = state.total;
            clockLastUp = performance.now();
            playback = null;
            statusEl.textContent = recorder ? "Finishing video…" : `Finished "${play.name}".`;
            finishRecording();
            updatePlaybackButtons();
        }
    };
    playback = state;
    statusEl.textContent = `Playing "${play.name}"…`;
    updatePlaybackButtons();
    step(0);
    state.frame = requestAnimationFrame(tick);
    return true;
}

async function playSavedPlay(id) {
    stopPlayback();
    try {
        const res = await ownerFetch(`/api/plays/${id}`);
        if (!res.ok) throw new Error("Play not found.");
        startPlayback(await res.json());
    } catch (error) {
        statusEl.textContent = `Could not play: ${error.message}`;
    }
}

function togglePlayback() {
    if (!playback) {
        if (lastPlay) startPlayback(lastPlay);
        return;
    }
    playback.paused = !playback.paused;
    // Reset the clock reference so time spent paused is not counted.
    playback.last = null;
    statusEl.textContent = playback.paused ? "Playback paused." : "Playing…";
    updatePlaybackButtons();
}

togglePlaybackButton.addEventListener("click", togglePlayback);
restartPlaybackButton.addEventListener("click", () => {
    if (lastPlay) startPlayback(lastPlay);
});
saveVideoButton.addEventListener("click", saveVideo);
updatePlaybackButtons();

// Register the service worker so the board can be installed and opened offline.
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
}

async function loadPlayFromDatabase(id) {
    stopPlayback();
    try {
        const res = await ownerFetch(`/api/plays/${id}`);
        if (!res.ok) throw new Error("Play not found.");
        const play = await res.json();
        applyPlay(play);
        lastPlay = play;
        updatePlaybackButtons();
        statusEl.textContent = `Play "${play.name}" loaded.`;
        closePlaysModal();
    } catch (error) {
        statusEl.textContent = `Could not load play: ${error.message}`;
    }
}

async function deletePlay(play, button) {
    // Two-step delete without window.confirm, which some embedded browsers block.
    if (button.dataset.armed !== "yes") {
        button.dataset.armed = "yes";
        button.textContent = "Sure?";
        return;
    }
    const res = await ownerFetch(`/api/plays/${play.play_id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) statusEl.textContent = "Could not delete play.";
    refreshPlaysList();
}

// Each browser gets a random private ID so saved plays belong to that browser only.
function getOwnerId() {
    let id = localStorage.getItem("ownerId");
    if (!id) {
        id = window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join("");
        localStorage.setItem("ownerId", id);
    }
    return id;
}

// fetch wrapper that identifies the owner on every saved-plays request.
function ownerFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: { ...options.headers, "x-owner-id": getOwnerId() },
    });
}

function closePlaysModal() {
    playsModal.hidden = true;
}

function openPlaysModal() {
    playsModal.hidden = false;
    refreshPlaysList();
}

// Saving and loading both live in the same window: name the board to save it, or pick a saved play.
savePlayButton.addEventListener("click", () => {
    openPlaysModal();
    playNameInput.focus();
});
loadPlayButton.addEventListener("click", openPlaysModal);
saveCurrentButton.addEventListener("click", savePlayToDatabase);
playNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") savePlayToDatabase();
});
closePlaysButton.addEventListener("click", closePlaysModal);
openFileButton.addEventListener("click", () => playFileInput.click());
downloadFileButton.addEventListener("click", savePlayToFile);
// Read the chosen JSON file after the user selects one.
playFileInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) loadPlayFromFile(file);
    event.target.value = "";
});

function updateTeamButtons() {
    for (const team of Object.keys(teamButtons)) {
        const name = team[0].toUpperCase() + team.slice(1);
        teamButtons[team].textContent = `${name} Team: ${teamVisible[team] ? "On" : "Off"}`;
    }
}

for (const team of Object.keys(teamButtons)) {
    teamButtons[team].addEventListener("click", () => {
        teamVisible[team] = !teamVisible[team];
        // Dropping a team mid-drag would leave an invisible selection behind.
        if (selected && selectedType === "player" && selected.team === team) endDrag();
        // Removing a team discards its trails; adding it back places players at their start spots.
        players.filter((p) => p.team === team).forEach((p) => {
            if (!teamVisible[team]) {
                playerTrails.delete(p.player_id);
            } else {
                const start = START_POSITIONS[p.team][p.position];
                p.x = start.x;
                p.y = start.y;
                p.highlight = null;
            }
        });
        updateTeamButtons();
        // With red removed, blue's Centre takes the centre circle; it goes back when red returns.
        if (team === "red") {
            const blueC = players.find((p) => p.team === "blue" && p.position === "C");
            if (blueC) {
                const spot = teamVisible.red ? START_POSITIONS.blue.C : START_POSITIONS.red.C;
                blueC.x = spot.x;
                blueC.y = spot.y;
                blueC.highlight = null;
            }
        }
        render();
    });
}

resetBoardButton.addEventListener("click", () => {
    stopPlayback();
    teamVisible.red = true;
    teamVisible.blue = true;
    updateTeamButtons();
    // Put every player and the ball back at the start and wipe all trails.
    players.forEach((p) => {
        const start = START_POSITIONS[p.team][p.position];
        p.x = start.x;
        p.y = start.y;
        p.highlight = null;
    });
    ball.x = BALL_START.x;
    ball.y = BALL_START.y;
    ball.highlight = false;
    playerTrails.clear();
    ballTrail = [];
    selected = null;
    selectedType = null;
    statusEl.textContent = "Board reset.";
    render();
});

// Return the ball to the centre circle when the user wants to reset its position.
addBallButton.addEventListener("click", () => {
    ball.x = BALL_START.x;
    ball.y = BALL_START.y;
    ball.highlight = false;
    ballTrail = [];
    statusEl.textContent = "Ball returned to its starting spot.";
    render();
});

async function loadPlayers() {
    // Request the seeded player records and allowed zones from the Node.js API.
    const res = await fetch("/api/players");
    const data = await res.json();

    // Combine database data with the visual starting coordinate for each player.
    players = data.map((p) => {
        const start = START_POSITIONS[p.team][p.position];
        return { ...p, x: start.x, y: start.y, highlight: null };
    });

    // Draw the initial board after all players have been loaded.
    render();
}

// Refit the court whenever the window (or fullscreen state) changes size.
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Start the application by loading players as soon as the script is evaluated.
loadPlayers();
