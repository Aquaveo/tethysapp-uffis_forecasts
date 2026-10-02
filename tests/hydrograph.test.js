/**
 * Tests for the hydrograph's scales, ticks and paths.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { bandPath, hydrographSummary, linear, linePath, timeTicks, valueTicks } from "../tethysapp/uffis_forecasts/public/js/hydrograph.js";

const HOUR = 3600 * 1000;

test("linear maps the domain ends onto the range ends", () => {
  const scale = linear([0, 10], [100, 0]);
  assert.equal(scale(0), 100);
  assert.equal(scale(5), 50);
});

test("value ticks start at zero and cover the max", () => {
  assert.deepEqual(valueTicks(64, 4), [0, 20, 40, 60, 80]);
  assert.deepEqual(valueTicks(0.3, 4), [0, 0.1, 0.2, 0.3]);
});

test("value ticks survive an all-zero series", () => {
  assert.deepEqual(valueTicks(0, 4), [0, 1]);
});

test("time ticks fall on whole hours at a readable step", () => {
  const start = Date.UTC(2026, 9, 1, 17, 30);
  const ticks = timeTicks(start, start + 36 * HOUR, 6);
  assert.equal(ticks[0], Date.UTC(2026, 9, 1, 18));
  assert.ok(ticks.every((t, i) => i === 0 || t - ticks[i - 1] === 6 * HOUR));
});

test("line and band paths trace the points", () => {
  assert.equal(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }]), "M0.0,1.0L2.0,3.0");
  assert.equal(bandPath([{ x: 0, min: 5, max: 1 }, { x: 2, min: 6, max: 2 }]), "M0.0,1.0L2.0,2.0L2.0,6.0L0.0,5.0Z");
});

test("the summary names each run's median peak and when", () => {
  const runs = [
    { run: "stream_sat", stats: [{ time: Date.UTC(2026, 9, 1, 18), median: 12.04 }, { time: Date.UTC(2026, 9, 1, 19), median: 9 }] },
    { run: "stormlab", stats: [{ time: Date.UTC(2026, 9, 2, 6), median: 3 }, { time: Date.UTC(2026, 9, 2, 12), median: 15.62 }] },
  ];
  assert.equal(hydrographSummary(runs),
    "Median peaks: Satellite rainfall (STREAM-SAT) 12.0 m³/s at 18:00 1 Oct; Forecast (StormLab) 15.6 m³/s at 12:00 2 Oct.");
});
