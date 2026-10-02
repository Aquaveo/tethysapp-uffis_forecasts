/**
 * Gauge time series: which series files a cycle has, where the gauges
 * are, and the ensemble spread of discharge over time.
 * EF5 writes one ts.<gauge>.crest.<cycle>.csv per member and run, and
 * its control file WA_*.txt next to them names each gauge's location.
 */

/** Precipitation runs that write gauge series, in time order. */
export const RUNS = ["stream_sat", "scampr", "stormlab"];

const SERIES_FILE = /^([^/]+)\/(stream_sat|scampr|stormlab)\/[^/]+\/ts\.(.+?)\.crest\.[\d.]+\.csv$/;
const CONTROL_FILE = /\/WA_[^/]+\.txt$/;
const GAUGE_LINE = /^\[Gauge ([^\]]+)\]\s+lon=(-?[\d.]+)\s+lat=(-?[\d.]+)/;

/**
 * Group a cycle's series files by grid, gauge and run, and find each
 * grid's control file.
 * @param {string[]} paths cycle-relative file paths
 * @returns {Record<string, {control?: string, gauges: Record<string, Record<string, string[]>>}>}
 */
export function gaugeFiles(paths) {
  const grids = {};
  for (const path of paths) {
    const match = path.match(SERIES_FILE);
    if (!match) continue;
    const [, grid, run, gauge] = match;
    grids[grid] ??= { gauges: {} };
    const runs = (grids[grid].gauges[gauge] ??= {});
    (runs[run] ??= []).push(path);
  }
  for (const grid of Object.keys(grids)) {
    grids[grid].control = paths.find((p) => p.startsWith(`${grid}/`) && CONTROL_FILE.test(p));
  }
  return grids;
}

/**
 * Gauges that carry coordinates in an EF5 control file.
 * @param {string} text control file contents
 * @returns {{name: string, lat: number, lon: number}[]}
 */
export function parseGauges(text) {
  return text.split("\n").map((line) => line.match(GAUGE_LINE)).filter(Boolean)
    .map(([, name, lon, lat]) => ({ name, lat: Number(lat), lon: Number(lon) }));
}

/**
 * Discharge over time from an EF5 series CSV, times in UTC.
 * @param {string} text CSV contents
 * @returns {{time: number, q: number}[]}
 */
export function parseSeries(text) {
  return text.trim().split("\n").slice(1).map((line) => {
    const [time, discharge] = line.split(",");
    return { time: Date.parse(`${time.replace(" ", "T")}:00Z`), q: Number(discharge) };
  }).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.q));
}

/**
 * Linearly interpolated quantile of sorted numbers.
 * @param {number[]} sorted ascending, non-empty
 * @param {number} q between 0 and 1
 * @returns {number}
 */
export function quantile(sorted, q) {
  const pos = (sorted.length - 1) * q;
  const below = Math.floor(pos);
  const above = Math.ceil(pos);
  return sorted[below] + (sorted[above] - sorted[below]) * (pos - below);
}

/**
 * 10th percentile, median and 90th percentile across ensemble members
 * at each time step. The band leaves out the outlying members so they
 * do not flatten the medians.
 * @param {{time: number, q: number}[][]} members
 * @returns {{time: number, low: number, median: number, high: number}[]}
 */
export function ensembleStats(members) {
  const byTime = new Map();
  for (const series of members) {
    for (const { time, q } of series) {
      if (!byTime.has(time)) byTime.set(time, []);
      byTime.get(time).push(q);
    }
  }
  return [...byTime.keys()].sort((a, b) => a - b).map((time) => {
    const sorted = byTime.get(time).sort((a, b) => a - b);
    return { time, low: quantile(sorted, 0.1), median: quantile(sorted, 0.5), high: quantile(sorted, 0.9) };
  });
}
