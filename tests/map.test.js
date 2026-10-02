/**
 * Tests for the map's bounds helpers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { edgeInsets, fitPadding, geojsonBounds, lngLatBounds, positionBounds } from "../tethysapp/uffis_forecasts/public/js/map.js";

test("bounds turn to longitude first for MapLibre", () => {
  assert.deepEqual(lngLatBounds([[13.7, -92.3], [17.9, -88.2]]), [[-92.3, 13.7], [-88.2, 17.9]]);
});

test("positions bound south-west to north-east", () => {
  assert.deepEqual(positionBounds([[-72.4, 19.9], [-71.6, 19.8], [-71.7, 18.0], [-74.5, 18.1]]), [[18.0, -74.5], [19.9, -71.6]]);
});

test("GeoJSON bounds cover every polygon and ignore heights", () => {
  const geojson = {
    features: [
      { geometry: { type: "Polygon", coordinates: [[[-90, 14, 5], [-89, 14, 5], [-89, 15, 5], [-90, 14, 5]]] } },
      { geometry: { type: "MultiPolygon", coordinates: [[[[-91, 13], [-90.5, 13], [-90.5, 13.5], [-91, 13]]]] } },
    ],
  };
  assert.deepEqual(geojsonBounds(geojson), [[13, -91], [15, -89]]);
});

const VIEW = { width: 1440, height: 900 };

test("desktop insets clear the bottom dock and the side panel", () => {
  const bar = { top: 790, bottom: 876, height: 86 };
  const panel = { top: 60, left: 1138, width: 290 };
  assert.deepEqual(edgeInsets(VIEW, 64, bar, panel), { top: 64, right: 302, bottom: 110, left: 0 });
});

test("a top-docked time bar covers the top, not the bottom", () => {
  const bar = { top: 72, bottom: 170, height: 98 };
  assert.deepEqual(edgeInsets({ width: 820, height: 1180 }, 64, bar, null), { top: 170, right: 0, bottom: 0, left: 0 });
});

test("a wide panel is a bottom sheet and a hidden bar covers nothing", () => {
  const bar = { top: 0, bottom: 0, height: 0 };
  const sheet = { top: 300, left: 8, width: 359 };
  assert.deepEqual(edgeInsets({ width: 375, height: 812 }, 64, bar, sheet), { top: 64, right: 0, bottom: 512, left: 0 });
});

test("fit padding adds a margin to the insets", () => {
  assert.deepEqual(fitPadding({ top: 64, right: 302, bottom: 110, left: 0 }, 1440, 900), { top: 80, right: 318, bottom: 126, left: 16 });
});

test("fit padding falls back to the margin when the map would vanish", () => {
  assert.deepEqual(fitPadding({ top: 64, right: 0, bottom: 260, left: 0 }, 568, 320), { top: 16, right: 16, bottom: 16, left: 16 });
});
