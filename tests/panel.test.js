/**
 * Tests for the control panel helpers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { regionLevel, regionNote } from "../tethysapp/uffis_forecasts/public/js/panel.js";

const NOW = new Date("2026-10-01T12:00:00Z");

test("a failed country is an error", () => {
  assert.equal(regionLevel({ error: "404" }, NOW), "error");
});

test("a fresh country is ok", () => {
  assert.equal(regionLevel({ published: new Date("2026-10-01T11:30:00Z") }, NOW), "ok");
});

test("an old country is stale", () => {
  assert.equal(regionLevel({ published: new Date("2026-10-01T08:00:00Z") }, NOW), "stale");
});

test("the region note says how fresh a country is in words", () => {
  assert.equal(regionNote({ published: new Date("2026-10-01T11:38:00Z") }, NOW), "published 22 min ago");
  assert.equal(regionNote({ error: "404" }, NOW), "no outputs found");
});
