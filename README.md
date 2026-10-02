# UFFIS Forecasts

Tethys app that serves the UFFIS forecast viewer at the root of `uffis.org`.
It reads TITO's published outputs straight from `https://tito.uffis.org/outputs`:
`latest.json`, each cycle's `index.json`, and the Cloud Optimized GeoTIFFs, which the browser decodes with geotiff.js.
There is no tile server and no database.

Gauges come from each cycle's EF5 control file (`WA_*.txt`, `[Gauge <name>] lon= lat=`), shown only when the cycle has their `ts.<gauge>.crest.<cycle>.csv` series.
Clicking one draws its hydrograph: discharge from the STREAM-SAT, SCaMPR and StormLab runs, each as a 10th to 90th percentile band of members and a median line.
Barbados and Comoros publish no gauge series yet.

The time bar steps through the last 24 hourly cycles, which the outputs bucket keeps for at least a day.
Each step loads that cycle's `index.json` and draws what that run issued; TITO publishes no per-hour grids within a cycle.
An hour with no cycle says so instead of drawing.

The app only runs inside the UFFIS portal (`Aquaveo/uffis-portal`).
Its page extends the portal's `uffis/apex.html`, which frames the viewer and carries the About UFFIS panel.
The portal mounts the app at `/` on the public schema and keeps it out of every agency tenant.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `UFFIS_OUTPUTS_BASE` | `https://tito.uffis.org/outputs` | Outputs tree the viewer reads |

On `localhost` and `127.0.0.1` a `?base=` query parameter overrides it, for testing against other data.

## Tests

```bash
npm test                         # module tests
CHROME=chromium npm run smoke    # headless browser smoke test
```

The smoke test renders `assets.html` and `viewer.html` against the fixtures in `tests/fixtures/outputs`.

## Source of the viewer

The modules in `tethysapp/uffis_forecasts/public/js` are copied from the TITO viewer, `Aquaveo/TITOAWSInfraCarribeanAndComorros` `site/js`, at commit `972c5e1`.
`outputs.js` and `main.js` differ: the outputs base comes from the page, and the page has the floating panel and gauges. `panel.js`, `gauges.js`, `hydrograph.js` and `timeline.js` are new here.
Diff against that commit before porting later viewer changes.
