# UFFIS Forecasts

Tethys app serving the UFFIS forecast map at `uffis.org/viewer/`, in English, French and Spanish.
The browser reads TITO's outputs straight from `https://tito.uffis.org/outputs` (COGs, gauge series, impact files); no tile server, no database.
It runs only inside the UFFIS portal (`Aquaveo/uffis-portal`), which frames it and keeps it off the agency tenants.

Setting: `UFFIS_OUTPUTS_BASE` (default `https://tito.uffis.org/outputs`). Locally, `?base=` overrides it.

## Translations

Text goes through Django i18n: `{% translate %}` in templates, `gettext`/`ngettext` from `public/js/i18n.js` in the JS (the portal serves the catalog at `/i18n/js/`).
After changing text, from `tethysapp/uffis_forecasts`: `django-admin makemessages -l fr -l es` and `django-admin makemessages -d djangojs -l fr -l es`, then translate the new entries in `locale/*/LC_MESSAGES/*.po`. The portal compiles them at build time and fails on anything untranslated; `npm test` checks the same.

## Tests

```bash
npm test
CHROME=chromium npm run smoke
```

## Source

`access`, `colors`, `config`, `dom`, `files`, `impact`, `layers`, `raster`, `status` and `outputs` in `public/js` started from the TITO viewer (`Aquaveo/TITOAWSInfraCarribeanAndComorros`, `site/js`, commit `972c5e1`); diff against it before porting viewer changes.
