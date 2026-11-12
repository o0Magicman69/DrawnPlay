const test = require("node:test");
const assert = require("node:assert/strict");
const { segments, withTimes, synchronizeBall } = require("../public/playback-paths");

test("separates recorded movements and leaves legacy paths intact", () => {
    assert.deepEqual(segments([{ start: true }, {}, { start: true }, {}]), [[0, 1], [2, 3]]);
    assert.deepEqual(segments([{}, {}, {}]), [[0, 2]]);
    assert.deepEqual(segments([]), []);
});

test("legacy paths get the previous fixed playback duration", () => {
    assert.deepEqual(withTimes([{ x: 0 }, { x: 1 }, { x: 2 }], 7000).map((p) => p.t), [0, 3500, 7000]);
});

test("ball arrives at the nearest moving receiver when their movement finishes", () => {
    const ball = [{ x: 0, y: 0, t: 2000 }, { x: 98, y: 0, t: 3000 }];
    const receiver = [{ x: 50, y: 0, t: 0 }, { x: 100, y: 0, t: 1000 }];
    const result = synchronizeBall(ball, [receiver], [], 29);
    assert.deepEqual(result.map((p) => p.t), [0, 1000]);
    assert.equal(result[1].x, 100);
    assert.equal(ball[1].x, 98);
});

test("separate passes meet their receivers in order", () => {
    const ball = [
        { x: 0, y: 0, t: 4000, start: true }, { x: 99, y: 0, t: 5000 },
        { x: 99, y: 0, t: 5400, start: true }, { x: 199, y: 0, t: 6400 },
    ];
    const paths = [
        [{ x: 50, y: 0, t: 0 }, { x: 100, y: 0, t: 1000 }],
        [{ x: 150, y: 0, t: 2000 }, { x: 200, y: 0, t: 3000 }],
    ];
    const result = synchronizeBall(ball, paths, [], 29);
    assert.deepEqual(result.map((p) => p.t), [0, 1000, 2000, 3000]);
    assert.deepEqual(result.map((p) => p.x), [0, 100, 100, 200]);
});

test("stationary receivers are matched without changing timing", () => {
    const ball = [{ x: 0, y: 0, t: 50 }, { x: 90, y: 0, t: 150 }];
    const result = synchronizeBall(ball, [], [{ x: 100, y: 0 }], 29);
    assert.deepEqual(result.map((p) => p.t), [50, 150]);
    assert.equal(result[1].x, 100);
});

test("unmatched passes keep their path and timing", () => {
    const ball = [{ x: 0, y: 0, t: 100 }, { x: 50, y: 0, t: 500 }];
    assert.deepEqual(synchronizeBall(ball, [], [{ x: 100, y: 0 }], 29), ball);
});

test("cannot move a later pass before an earlier pass", () => {
    const ball = [
        { x: 0, y: 0, t: 0, start: true }, { x: 100, y: 0, t: 1000 },
        { x: 100, y: 0, t: 1400, start: true }, { x: 200, y: 0, t: 2400 },
    ];
    const paths = [[{ x: 150, y: 0, t: 0 }, { x: 200, y: 0, t: 500 }]];
    const result = synchronizeBall(ball, paths, [], 29);
    assert.deepEqual(result.map((p) => p.t), [0, 1000, 1400, 2400]);
});
