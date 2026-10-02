/**
 * Loading TITO GeoTIFFs in the browser and placing them on a web map.
 * Uses the geotiff.js global (GeoTIFF) loaded by the page.
 */

import { fetchOk } from "./outputs.js";

const EARTH_RADIUS_M = 6378137;
const DEGREES = 180 / Math.PI;
const MAX_SIDE = 2048;
const UTM_SCALE = 0.9996;
const WGS84_E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);
// EPSG codes that are UTM zones
const UTM_ALIASES = { 5629: [38, true] };

/**
 * Download a GeoTIFF and decode the first band of its largest overview
 * that fits the map, so large grids stay quick to draw. Placement and
 * nodata come from the full resolution image.
 * @param {string} url
 * @returns {Promise<{values: ArrayLike<number>, width: number, height: number,
 *   bbox: number[], epsg: number, nodata: number|null}>}
 */
export async function loadRaster(url) {
  const response = await fetchOk(url);
  const tiff = await globalThis.GeoTIFF.fromArrayBuffer(await response.arrayBuffer());
  const images = [];
  for (let i = 0; i < await tiff.getImageCount(); i += 1) images.push(await tiff.getImage(i));
  const full = images[0];
  const image = images[overviewIndex(images.map((im) => Math.max(im.getWidth(), im.getHeight())), MAX_SIDE)];
  const [values] = await image.readRasters();
  const keys = full.getGeoKeys();
  return {
    values,
    width: image.getWidth(),
    height: image.getHeight(),
    bbox: full.getBoundingBox(),
    epsg: keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey,
    nodata: full.getGDALNoData(),
  };
}

/**
 * Index of the largest image whose longest side fits the cap; images
 * run from full resolution down. The smallest when none fits.
 * @param {number[]} sides longest side of each image
 * @param {number} cap
 * @returns {number}
 */
export function overviewIndex(sides, cap) {
  const fits = sides.findIndex((side) => side <= cap);
  return fits === -1 ? sides.length - 1 : fits;
}

/**
 * A raster's corners as [lng, lat], clockwise from the top left.
 * Supports the CRSs TITO writes: EPSG:4326, EPSG:3857 and UTM zones
 * (EPSG:326xx, 327xx and their aliases).
 * @param {number[]} bbox [minX, minY, maxX, maxY] in the raster CRS
 * @param {number} epsg
 * @returns {number[][]}
 */
export function rasterCorners([minX, minY, maxX, maxY], epsg) {
  const toLngLat = lngLatOf(epsg);
  return [[minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]].map(([x, y]) => toLngLat(x, y));
}

/**
 * The conversion from a CRS's x and y to [lng, lat].
 * @param {number} epsg
 * @returns {(x: number, y: number) => number[]}
 */
function lngLatOf(epsg) {
  if (epsg === 4326) return (x, y) => [x, y];
  if (epsg === 3857) return (x, y) => mercatorToLatLng(x, y).reverse();
  const utm = utmZone(epsg);
  if (utm) return (x, y) => utmToLatLng(x, y, ...utm).reverse();
  throw new Error(`unsupported CRS EPSG:${epsg}`);
}

/**
 * The UTM zone and hemisphere of an EPSG code, or null.
 * @param {number} epsg
 * @returns {[number, boolean]|null} [zone, south]
 */
export function utmZone(epsg) {
  if (epsg > 32600 && epsg <= 32660) return [epsg - 32600, false];
  if (epsg > 32700 && epsg <= 32760) return [epsg - 32700, true];
  return UTM_ALIASES[epsg] || null;
}

/**
 * Convert WGS84 UTM metres to [latitude, longitude] in degrees, by the
 * standard inverse transverse Mercator series (millimetre accuracy).
 * @param {number} easting
 * @param {number} northing
 * @param {number} zone 1 to 60
 * @param {boolean} south southern hemisphere
 * @returns {number[]}
 */
export function utmToLatLng(easting, northing, zone, south) {
  const e2 = WGS84_E2;
  const ep2 = e2 / (1 - e2);
  const x = easting - 500000;
  const y = south ? northing - 10000000 : northing;
  const mu = y / UTM_SCALE / (EARTH_RADIUS_M * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi = mu + (1.5 * e1 - (27 / 32) * e1 ** 3) * Math.sin(2 * mu)
    + ((21 / 16) * e1 ** 2 - (55 / 32) * e1 ** 4) * Math.sin(4 * mu)
    + ((151 / 96) * e1 ** 3) * Math.sin(6 * mu)
    + ((1097 / 512) * e1 ** 4) * Math.sin(8 * mu);
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const n = EARTH_RADIUS_M / Math.sqrt(1 - e2 * sin ** 2);
  const t = Math.tan(phi) ** 2;
  const c = ep2 * cos ** 2;
  const r = (EARTH_RADIUS_M * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5;
  const d = x / (n * UTM_SCALE);
  const lat = phi - ((n * Math.tan(phi)) / r) * (d ** 2 / 2
    - ((5 + 3 * t + 10 * c - 4 * c ** 2 - 9 * ep2) * d ** 4) / 24
    + ((61 + 90 * t + 298 * c + 45 * t ** 2 - 252 * ep2 - 3 * c ** 2) * d ** 6) / 720);
  const lng = (d - ((1 + 2 * t + c) * d ** 3) / 6
    + ((5 - 2 * c + 28 * t - 3 * c ** 2 + 8 * ep2 + 24 * t ** 2) * d ** 5) / 120) / cos;
  return [lat * DEGREES, (zone - 1) * 6 - 177 + lng * DEGREES];
}

/**
 * Convert Web Mercator metres to [latitude, longitude] in degrees.
 * @param {number} x
 * @param {number} y
 * @returns {number[]}
 */
export function mercatorToLatLng(x, y) {
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * DEGREES;
  return [lat, (x / EARTH_RADIUS_M) * DEGREES];
}
