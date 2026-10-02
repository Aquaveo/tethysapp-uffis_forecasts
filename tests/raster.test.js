/**
 * Tests for placing rasters on the map.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mercatorToLatLng, overviewIndex, rasterBounds, utmToLatLng } from "../tethysapp/uffis_forecasts/public/js/raster.js";

test("geographic bounds swap to latitude first", () => {
  assert.deepEqual(rasterBounds([-92.3, 13.7, -88.2, 17.8], 4326), [[13.7, -92.3], [17.8, -88.2]]);
});

test("web mercator converts to degrees", () => {
  const [lat, lng] = mercatorToLatLng(-10077895, 1629000);
  assert.ok(Math.abs(lng - -90.53) < 0.01);
  assert.ok(Math.abs(lat - 14.48) < 0.01);
});

test("CRSs other than geographic, mercator and UTM are refused", () => {
  assert.throws(() => rasterBounds([0, 0, 1, 1], 2154), /EPSG:2154/);
});

/**
 * Assert two numbers agree to about a metre.
 * @param {number} actual
 * @param {number} expected
 */
function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} vs ${expected}`);
}

test("UTM north converts to degrees (Haiti flood rasters, EPSG:32618)", () => {
  const [lat, lng] = utmToLatLng(780000, 2050000, 18, false);
  near(lat, 18.522011);
  near(lng, -72.347909);
});

test("UTM south converts to degrees (Comoros flood rasters, EPSG:5629)", () => {
  const [lat, lng] = utmToLatLng(350000, 8700000, 38, true);
  near(lat, -11.756542);
  near(lng, 43.623417);
});

test("UTM rasters place on the map", () => {
  const [[south, west], [north, east]] = rasterBounds([750000, 1620000, 780000, 2050000], 32618);
  assert.ok(south < north && west < east);
  near(rasterBounds([500000, 0, 500001, 1], 32618)[0][1], -75);
  near(rasterBounds([350000, 8700000, 350001, 8700001], 5629)[0][0], -11.756542);
});

test("the largest overview within the size cap is chosen", () => {
  assert.equal(overviewIndex([5612, 2806, 1403, 701, 350], 2048), 2);
  assert.equal(overviewIndex([571], 2048), 0);
  assert.equal(overviewIndex([4000, 3000], 2048), 1);
});
