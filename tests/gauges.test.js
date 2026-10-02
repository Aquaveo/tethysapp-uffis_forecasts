/**
 * Tests for gauge locations, series parsing and ensemble statistics.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { ensembleStats, gaugeFiles, parseGauges, parseSeries, quantile } from "../tethysapp/uffis_forecasts/public/js/gauges.js";

const PATHS = [
  "guatemala_90m/stream_sat/ensOut1/WA_Guatemala_crest.txt",
  "guatemala_90m/stream_sat/ensOut1/ts.villa_out.crest.20261002.000000.csv",
  "guatemala_90m/stream_sat/ensOut2/ts.villa_out.crest.20261002.000000.csv",
  "guatemala_90m/stormlab/ensOut1_sl1/ts.villa_out.crest.20261002.000000.csv",
  "guatemala_90m/scampr/ensOut1/ts.villa_out.crest.20261002.000000.csv",
  "guatemala_900m/stream_sat/ensOut1/ts.villa_out.crest.20261002.000000.csv",
  "guatemala_90m/summary/qpeaccum_forecast_median.20261002.000000.tif",
];

const CONTROL = `[Gauge 0] cellx=1651 celly=1036 outputts=false
[Gauge villa_out] lon=-90.67 lat=14.41 outputts=true
[Gauge villa_up] lon=-90.53 lat=14.48 outputts=true`;

const CSV = `Time,Discharge(m^3 s^-1),Observed(m^3 s^-1),Precip(mm h^-1)
2026-10-01 18:00,63.92,nan,0.00
2026-10-01 18:30,64.12,nan,0.02`;

test("series files group by grid, gauge and run", () => {
  const files = gaugeFiles(PATHS);
  assert.deepEqual(Object.keys(files), ["guatemala_90m", "guatemala_900m"]);
  assert.equal(files.guatemala_90m.gauges.villa_out.stream_sat.length, 2);
  assert.equal(files.guatemala_90m.gauges.villa_out.stormlab.length, 1);
  assert.equal(files.guatemala_90m.control, PATHS[0]);
  assert.equal(files.guatemala_900m.control, undefined);
});

test("no series files gives no grids", () => {
  assert.deepEqual(gaugeFiles([PATHS[6]]), {});
});

test("control file gauges with coordinates are read", () => {
  assert.deepEqual(parseGauges(CONTROL), [
    { name: "villa_out", lat: 14.41, lon: -90.67 },
    { name: "villa_up", lat: 14.48, lon: -90.53 },
  ]);
});

test("series times are UTC and discharge is numeric", () => {
  const series = parseSeries(CSV);
  assert.equal(series.length, 2);
  assert.equal(series[0].time, Date.UTC(2026, 9, 1, 18, 0));
  assert.equal(series[1].q, 64.12);
});

test("unreadable discharge values are skipped", () => {
  assert.equal(parseSeries(`${CSV}\n2026-10-01 19:00,nan,nan,0`).length, 2);
});

test("quantiles interpolate between members", () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9), 90);
  assert.equal(quantile([7], 0.1), 7);
});

test("ensemble statistics align members by time", () => {
  const a = [{ time: 1, q: 1 }, { time: 2, q: 10 }];
  const b = [{ time: 1, q: 3 }, { time: 2, q: 20 }];
  const c = [{ time: 1, q: 2 }];
  assert.deepEqual(ensembleStats([a, b, c]), [
    { time: 1, low: 1.2, median: 2, high: 2.8 },
    { time: 2, low: 11, median: 15, high: 19 },
  ]);
});

test("one outlying member stays out of the band", () => {
  const members = [1, 1, 1, 1, 1, 1, 1, 1, 1, 200].map((q) => [{ time: 1, q }]);
  const [step] = ensembleStats(members);
  assert.ok(step.high < 30, `high ${step.high}`);
});
