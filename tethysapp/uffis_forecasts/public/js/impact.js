/**
 * Impact based forecasting (IBF) results: exposure per municipality,
 * the cycle's risk summary, and the popup shown on the map.
 * Fields follow AHWA's ibf_utils: risk_level comes from the flood risk
 * matrix; hzrd_<c>_* counts exposure by hazard class, where class 0 is
 * no hazard and classes 1-4 are the 10, 30, 70 and 100 cm thresholds.
 */

import { fill, gettext, locale, number } from "./i18n.js";
import { element } from "./dom.js";

const HAZARD_CLASSES = [1, 2, 3, 4];
const LEVELS_HIGH_FIRST = ["HIGH", "MEDIUM", "LOW"];
const LEVEL_WORDS = { HIGH: gettext("high"), MEDIUM: gettext("medium"), LOW: gettext("low") };

/**
 * People, buildings and road length exposed to any hazard class.
 * @param {object} properties one municipality of ibf_admin.geojson
 * @returns {{population: number, buildings: number, roadsKm: number}}
 */
export function exposure(properties) {
  const sum = (metric) => HAZARD_CLASSES.reduce((total, c) => total + (properties[`hzrd_${c}_${metric}`] || 0), 0);
  return { population: sum("total_pop"), buildings: sum("bldg_count"), roadsKm: sum("rd_len_m") / 1000 };
}

/**
 * One-line summary of a site's cycle from ibf_summary.json.
 * @param {{buildings_by_risk: Record<string, number>, population_at_yellow_or_worse: number}} summary
 * @returns {string}
 */
export function riskSummary(summary) {
  const counts = LEVELS_HIGH_FIRST.map((level) => `${number(summary.buildings_by_risk[level] || 0)} ${LEVEL_WORDS[level]}`);
  const people = number(Math.round(summary.population_at_yellow_or_worse || 0));
  return fill(gettext("Buildings at risk: %(counts)s. People at low risk or worse: %(people)s."), { counts: counts.join(", "), people });
}

/**
 * A municipality's name: ADM_NAME, or ADMn_EN in humanitarian
 * boundaries, else its code.
 * @param {object} properties one municipality of ibf_admin.geojson
 * @returns {string}
 */
export function adminName(properties) {
  const key = Object.keys(properties).find((k) => k === "ADM_NAME" || /^ADM\d_EN$/.test(k));
  const code = Object.keys(properties).find((k) => k === "ADM_ID" || /^ADM\d_PCODE$/.test(k));
  return (key && properties[key]) || (code && properties[code]) || gettext("Municipality");
}

/**
 * The popup for one municipality.
 * @param {object} properties one municipality of ibf_admin.geojson
 * @returns {HTMLElement}
 */
export function popupElement(properties) {
  const e = exposure(properties);
  const box = element("div", "popup");
  const rows = [
    [gettext("Risk level"), properties.risk_level],
    [gettext("Population"), number(Math.round(properties.total_pop || 0))],
    [gettext("People exposed"), number(Math.round(e.population))],
    [gettext("Buildings exposed"), number(e.buildings)],
    [gettext("Roads exposed"), `${e.roadsKm.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`],
  ];
  box.append(element("strong", "", adminName(properties)));
  for (const [label, value] of rows) {
    const row = element("div", "row");
    row.append(element("span", "label", label), element("span", "", String(value)));
    box.append(row);
  }
  return box;
}
