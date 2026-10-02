/**
 * Tests for the map's bounds helpers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { geojsonBounds, lngLatBounds, positionBounds } from "../tethysapp/uffis_forecasts/public/js/map.js";

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
