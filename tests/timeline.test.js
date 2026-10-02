/**
 * Tests for moving between hourly cycles.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { HOURS_BACK, clampOffset, shiftCycle, timeLabel } from "../tethysapp/uffis_forecasts/public/js/timeline.js";

test("shifting a cycle moves it by whole hours across days", () => {
  assert.equal(shiftCycle("20261002.020000", -3), "20261001.230000");
  assert.equal(shiftCycle("20261002.020000", 0), "20261002.020000");
});

test("offsets stay within the kept cycles", () => {
  assert.equal(clampOffset(5), 0);
  assert.equal(clampOffset(-30), -HOURS_BACK);
  assert.equal(clampOffset(-6), -6);
});

test("the label says how far behind the latest cycle it is", () => {
  assert.equal(timeLabel("20261002.020000", 0), "2026-10-02 02:00 UTC · latest");
  assert.equal(timeLabel("20261002.020000", -6), "2026-10-01 20:00 UTC · 6 h before latest");
});
