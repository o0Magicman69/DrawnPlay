(function (root) {
    function segments(path) {
        const result = [];
        let start = 0;
        for (let i = 1; i < path.length; i++) {
            if (path[i].start) {
                result.push([start, i - 1]);
                start = i;
            }
        }
        if (path.length) result.push([start, path.length - 1]);
        return result;
    }

    function withTimes(path, duration) {
        const timed = path.every((point) => Number.isFinite(point.t));
        return path.map((point, index) => ({
            ...point,
            t: timed ? point.t : duration * index / Math.max(path.length - 1, 1),
        }));
    }

    function synchronizeBall(ballPath, playerPaths, stationaryPlayers, maxDistance) {
        const ball = ballPath.map((point) => ({ ...point }));
        const candidates = [];
        for (const path of playerPaths) {
            for (const [start, end] of segments(path)) {
                if (start < end) candidates.push({ point: path[end], start: path[start].t, end: path[end].t });
            }
        }
        for (const player of stationaryPlayers) candidates.push({ point: player });

        let previousEnd = 0;
        for (const [start, end] of segments(ball)) {
            if (start === end) continue;
            const first = ball[start];
            const last = ball[end];
            const originalStart = first.t;
            const originalEnd = last.t;
            const matches = candidates
                .map((candidate) => ({
                    ...candidate,
                    distance: Math.hypot(candidate.point.x - last.x, candidate.point.y - last.y),
                }))
                .filter((candidate) => candidate.distance <= maxDistance &&
                    (candidate.end === undefined || (candidate.end > previousEnd && candidate.end > candidate.start)))
                .sort((a, b) => a.distance - b.distance ||
                    Math.abs((a.end ?? originalEnd) - originalEnd) - Math.abs((b.end ?? originalEnd) - originalEnd));
            const receiver = matches[0];
            let newStart = Math.max(originalStart, previousEnd);
            let newEnd = newStart + Math.max(originalEnd - originalStart, 0);
            if (receiver && receiver.end !== undefined) {
                newStart = Math.max(previousEnd, receiver.start);
                newEnd = receiver.end;
            }
            const originalSpan = originalEnd - originalStart;
            for (let i = start; i <= end; i++) {
                const fraction = originalSpan > 0
                    ? (ball[i].t - originalStart) / originalSpan
                    : (i - start) / (end - start);
                ball[i].t = newStart + fraction * (newEnd - newStart);
            }
            if (start > 0) {
                ball[start].x = ball[start - 1].x;
                ball[start].y = ball[start - 1].y;
            }
            if (receiver) {
                last.x = receiver.point.x;
                last.y = receiver.point.y;
            }
            previousEnd = newEnd;
        }
        return ball;
    }

    const api = { segments, withTimes, synchronizeBall };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.PlaybackPaths = api;
})(globalThis);
