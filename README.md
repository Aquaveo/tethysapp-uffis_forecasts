# UFFIS Forecasts

Tethys app that serves the UFFIS forecast viewer at the root of `uffis.org`.
It reads TITO's published outputs straight from `https://tito.uffis.org/outputs`:
`latest.json`, each cycle's `index.json`, and the Cloud Optimized GeoTIFFs, which the browser decodes with geotiff.js.
There is no tile server and no database.

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
Only `outputs.js` and `main.js` differ: the outputs base comes from the page.
Diff against that commit before porting later viewer changes.
