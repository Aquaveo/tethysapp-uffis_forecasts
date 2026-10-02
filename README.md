# UFFIS Forecasts

Tethys app serving the UFFIS forecast map at the root of `uffis.org`.
The browser reads TITO's outputs straight from `https://tito.uffis.org/outputs` (COGs, gauge series, impact files); no tile server, no database.
It runs only inside the UFFIS portal (`Aquaveo/uffis-portal`), which frames it and keeps it off the agency tenants.

Setting: `UFFIS_OUTPUTS_BASE` (default `https://tito.uffis.org/outputs`). Locally, `?base=` overrides it.

## Tests

```bash
npm test
CHROME=chromium npm run smoke
```

## Source

`access`, `colors`, `config`, `dom`, `files`, `impact`, `layers`, `raster`, `status` and `outputs` in `public/js` started from the TITO viewer (`Aquaveo/TITOAWSInfraCarribeanAndComorros`, `site/js`, commit `972c5e1`); diff against it before porting viewer changes.
