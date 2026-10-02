/**
 * Tests for placing rasters on the map.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mercatorToLatLng, overviewIndex, rasterCorners, utmToLatLng } from "../tethysapp/uffis_forecasts/public/js/raster.js";

test("geographic corners run clockwise from the top left", () => {
  assert.deepEqual(rasterCorners([-92.3, 13.7, -88.2, 17.8], 4326), [[-92.3, 17.8], [-88.2, 17.8], [-88.2, 13.7], [-92.3, 13.7]]);
});

test("web mercator converts to degrees", () => {
  const [lat, lng] = mercatorToLatLng(-10077895, 1629000);
  assert.ok(Math.abs(lng - -90.53) < 0.01);
  assert.ok(Math.abs(lat - 14.48) < 0.01);
});

test("CRSs other than geographic, mercator and UTM are refused", () => {
  assert.throws(() => rasterCorners([0, 0, 1, 1], 2154), /EPSG:2154/);
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

test("UTM rasters place by their true corners", () => {
  const [topLeft, topRight, bottomRight, bottomLeft] = rasterCorners([750000, 1620000, 780000, 2050000], 32618);
  assert.ok(topLeft[1] > bottomLeft[1] && topRight[0] > topLeft[0]);
  assert.notEqual(topLeft[0], bottomLeft[0]);
  near(rasterCorners([500000, 0, 500001, 1], 32618)[3][0], -75);
  near(rasterCorners([350000, 8700000, 350001, 8700001], 5629)[3][1], -11.756542);
  near(bottomRight[1], utmToLatLng(780000, 1620000, 18, false)[0]);
});

test("the largest overview within the size cap is chosen", () => {
  assert.equal(overviewIndex([5612, 2806, 1403, 701, 350], 2048), 2);
  assert.equal(overviewIndex([571], 2048), 0);
  assert.equal(overviewIndex([4000, 3000], 2048), 1);
});
