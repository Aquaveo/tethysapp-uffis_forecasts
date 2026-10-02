/**
 * Fixed settings for the TITO outputs viewer: countries, age thresholds
 * and the legend classes used by the forecast app.
 */

import { fill, gettext } from "./i18n.js";

/**
 * Countries in display order, keyed by their outputs/ folder, with the
 * map extent to zoom to as [[south, west], [north, east]].
 */
export const COUNTRIES = [
  { key: "guatemala", name: gettext("Guatemala"), extent: [[13.7, -92.3], [17.9, -88.2]] },
  { key: "haiti", name: gettext("Haiti"), extent: [[18.0, -74.5], [20.1, -71.6]] },
  // Paused at Barbados request
  // { key: "barbados", name: gettext("Barbados"), extent: [[13.03, -59.66], [13.34, -59.41]] },
  { key: "antigua", name: gettext("Antigua and Barbuda"), extent: [[16.95, -61.95], [17.75, -61.65]] },
  { key: "comoros", name: gettext("Comoros"), extent: [[-12.45, 43.2], [-11.35, 44.55]] },
];

/** Minutes since publication before a country is late, then stale. */
export const AGE_LIMITS = { lateMinutes: 90, staleMinutes: 150 };

/**
 * Legend classes per product. A value v falls in class i when
 * breaks[i] <= v < breaks[i + 1]; values below breaks[0] are not drawn.
 * Labels match the forecast app's legends.
 */
export const LEGENDS = {
  qpeaccum: {
    title: gettext("Rainfall accumulation"),
    unit: "mm",
    breaks: [1, 5, 10, 25, 50, 75, 100, 150, 250, Infinity],
    colors: ["#d9f0a3", "#addd8e", "#41ab5d", "#ffffb2", "#fdae61", "#f46d43", "#d73027", "#a50026", "#6a3d9a"],
    labels: [between("1", "5"), between("5", "10"), between("10", "25"), between("25", "50"), between("50", "75"), between("75", "100"), between("100", "150"), between("150", "250"), andMore("250")],
  },
  maxunitq: {
    title: gettext("Max unit streamflow"),
    unit: gettext("m³/s per km²"),
    breaks: [0.1, 1, 2, 4, 6, 10, 20, Infinity],
    colors: ["#bdbdbd", "#d9ef8b", "#fdae61", "#d73027", "#c51b7d", "#2c7bb6", "#08306b"],
    labels: [between("0.1", "1"), between("1", "2"), between("2", "4"), between("4", "6"), between("6", "10"), between("10", "20"), andMore("20")],
  },
  maxsm: {
    title: gettext("Soil saturation"),
    unit: "%",
    breaks: [10, 30, 50, 70, 85, 95, 100.1],
    colors: ["#f6e8c3", "#dfc27d", "#80cdc1", "#35978f", "#01665e", "#003c30"],
    labels: [between("10", "30"), between("30", "50"), between("50", "70"), between("70", "85"), between("85", "95"), between("95", "100")],
  },
  flood: {
    title: gettext("Flood probability"),
    unit: gettext("% of members"),
    breaks: [0.05, 0.2, 0.5, 0.8, 1.01],
    colors: ["#c6dbef", "#6baed6", "#3f51d8", "#5b00b3"],
    labels: [between("5", "20"), between("20", "50"), between("50", "80"), between("80", "100")],
  },
};

/**
 * IBF risk levels (risk_class 0-3) with AHWA's colours from
 * ibf_utils/config.py, for the impact legend.
 */
export const IMPACT_LEGEND = {
  title: gettext("Impact risk level"),
  unit: gettext("IBF risk matrix"),
  breaks: [0, 1, 2, 3, 4],
  colors: ["#63BE5F", "#FFD500", "#F58220", "#DA291C"],
  labels: [gettext("Very low"), gettext("Low"), gettext("Medium"), gettext("High")],
};

/** Depth thresholds, in cm, of the flood probability rasters. */
export const FLOOD_DEPTHS_CM = [10, 30, 70, 100];

/** Phones and short landscape screens. */
export const SMALL_SCREEN = "(max-width: 640px), (max-height: 500px)";

/**
 * Legend label for a class between two values.
 * @param {string} low
 * @param {string} high
 * @returns {string}
 */
function between(low, high) {
  return fill(gettext("%(low)s to %(high)s"), { low, high });
}

/**
 * Legend label for the open top class.
 * @param {string} low
 * @returns {string}
 */
function andMore(low) {
  return fill(gettext("%(low)s and more"), { low });
}
