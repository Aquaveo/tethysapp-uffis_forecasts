/**
 * Page entry point: wires the control panel, the files sheet and the map.
 */

import { COUNTRIES, FLOOD_DEPTHS_CM, IMPACT_LEGEND, LEGENDS } from "./config.js";
import { accessElement, accessUrls } from "./access.js";
import { classifyCells, drawnCount, paintCells } from "./colors.js";
import { element, setOptions } from "./dom.js";
import { buildTree, filterFiles, folderElement, formatBytes } from "./files.js";
import { RUNS, ensembleStats, gaugeFiles, parseGauges, parseSeries } from "./gauges.js";
import { RUN_STYLE, hydrographSummary, hydrographSvg } from "./hydrograph.js";
import { ViewerMap, gaugeLabel } from "./map.js";
import { agenciesByCountry, fillGauges, fillRegions, markRegions, showAgency } from "./panel.js";
import { popupElement, riskSummary } from "./impact.js";
import { chosenLayer, siteChoices } from "./layers.js";
import { basinsOf, cycleTime, fetchJson, fetchOk, loadCycle, loadCycleAt, outputsBase, withoutCountry } from "./outputs.js";
import { loadRaster, rasterBounds } from "./raster.js";
import { loadStatus, statusCard } from "./status.js";
import { HOURS_BACK, clampOffset, shiftCycle, timeLabel } from "./timeline.js";

const REFRESH_MS = 5 * 60 * 1000;
const base = outputsBase(window.location, document.getElementById("uffis-viewer").dataset.outputsBase);
const form = document.getElementById("controls");
const info = document.getElementById("info");
const filter = document.getElementById("file-filter");
const regions = document.getElementById("regions");
const agencies = agenciesByCountry(document);
const viewer = new ViewerMap(document.getElementById("map"));
const cycles = new Map();
let drawToken = 0;
let fittedKey = "";
let filesCycle = null;
let statuses = [];
let gaugeToken = 0;
let offset = 0;
let playing = false;
const slider = document.getElementById("cycle-slider");
const PLAY_STEP_MS = 900;
const HYDRO_SIZE = { width: 520, height: 220 };

/**
 * Reload every country's status, colour the region chips and stamp
 * the panel.
 */
async function refreshStatus() {
  statuses = await Promise.all(COUNTRIES.map((country) => loadStatus(base, country)));
  const now = new Date();
  markRegions(regions, statuses, now);
  showSelectedStatus();
  document.getElementById("stamp").textContent = `Checked ${now.toISOString().slice(11, 16)} UTC, refreshes every 5 minutes`;
}

/**
 * Title the panel with the selected country and show its status card.
 */
function showSelectedStatus() {
  const key = form.country.value;
  const place = COUNTRIES.find((c) => c.key === key).name;
  document.getElementById("viewer-title").textContent = place;
  showAgency(document.getElementById("agency"), place, agencies[key]);
  const status = statuses.find((s) => s.key === key);
  if (status) document.getElementById("status").replaceChildren(statusCard(status, new Date()));
}

/**
 * Show or hide the control panel from its toggle button.
 * @param {HTMLButtonElement} button
 */
function togglePanel(button) {
  const panel = document.getElementById("panel");
  panel.hidden = !panel.hidden;
  button.setAttribute("aria-expanded", String(!panel.hidden));
  button.textContent = panel.hidden ? "Show controls" : "Hide controls";
}

/**
 * Apply the opacity slider to the map and its readout.
 */
function applyOpacity() {
  const percent = Number(form.opacity.value);
  viewer.setOpacity(percent / 100);
  document.getElementById("opacity-value").textContent = `${percent}%`;
}

/**
 * Load something once and keep it, forgetting a failure so the next
 * request retries it.
 * @param {string} key
 * @param {() => Promise<any>} load
 * @returns {Promise<any>}
 */
function cached(key, load) {
  if (!cycles.has(key)) {
    const pending = load();
    cycles.set(key, pending);
    pending.catch(() => {
      if (cycles.get(key) === pending) cycles.delete(key);
    });
  }
  return cycles.get(key);
}

/**
 * The newest cycle of a country, loaded once per refresh period.
 * @param {string} country
 * @returns {Promise<{latest: object, paths: string[], root: string}>}
 */
function latestCycle(country) {
  return cached(`${country}/latest`, () => loadCycle(base, country));
}

/**
 * The cycle the time slider points at for a country. Past cycles do
 * not change, so each is loaded once.
 * @param {string} country
 * @returns {Promise<{latest: object, paths: string[], root: string}>}
 */
async function countryCycle(country) {
  const latest = await latestCycle(country);
  if (!offset) return latest;
  const name = shiftCycle(latest.latest.cycle, offset);
  return cached(`${country}/${name}`, () => loadCycleAt(base, country, name));
}

/**
 * Show the selected cycle's time beside the slider.
 */
async function showTime() {
  try {
    const latest = await latestCycle(form.country.value);
    document.getElementById("cycle-label").textContent = timeLabel(latest.latest.cycle, offset);
  } catch {
    document.getElementById("cycle-label").textContent = "No cycle published";
  }
}

/**
 * Point the viewer at the cycle some hours before the latest one.
 * @param {number} hours 0 or negative
 * @returns {Promise<void>}
 */
async function setOffset(hours) {
  offset = clampOffset(hours);
  slider.value = String(offset);
  updateTimeButtons();
  closeHydrograph();
  showTime();
  await changeCountry();
}

/**
 * Disable the steps that would leave the kept cycles, and Now at the
 * latest cycle.
 */
function updateTimeButtons() {
  for (const button of document.querySelectorAll("[data-step]")) {
    const step = Number(button.dataset.step);
    button.disabled = step < 0 ? offset === -HOURS_BACK : offset === 0;
  }
  document.getElementById("cycle-now").disabled = offset === 0;
}

/**
 * Keep screen readers quiet while playing; announce cycles otherwise.
 */
function setAnnouncements() {
  const mode = playing ? "off" : "polite";
  document.getElementById("cycle-label").setAttribute("aria-live", mode);
  info.setAttribute("aria-live", mode);
}

/**
 * Play through the kept cycles up to the latest, or stop playing.
 * Each step waits for its map to draw.
 * @param {HTMLButtonElement} button
 */
async function togglePlay(button) {
  playing = !playing;
  button.setAttribute("aria-pressed", String(playing));
  button.textContent = playing ? "Pause" : "Play";
  setAnnouncements();
  if (!playing) return;
  if (offset === 0) await setOffset(-HOURS_BACK);
  while (playing && offset < 0) {
    await new Promise((resolve) => setTimeout(resolve, PLAY_STEP_MS));
    if (playing) await setOffset(offset + 1);
  }
  if (playing) togglePlay(button);
}

/**
 * Offer the grids and sites that exist in this cycle.
 * @param {{paths: string[]}} cycle
 */
function fillCycleOptions({ paths }) {
  setOptions(form.basin, basinsOf(paths).map((b) => ({ value: b, label: withoutCountry(b) })));
  setOptions(form.site, siteChoices(paths, form.product.value));
}

/**
 * Show only the controls that apply to the chosen product.
 */
function toggleControls() {
  const bySite = ["flood", "impact"].includes(form.product.value);
  for (const name of ["basin", "stat", "period"]) form[name].closest("label").hidden = bySite;
  for (const name of ["site", "depth"]) form[name].closest("label").hidden = !bySite;
}

/**
 * Draw the chosen product. Newer requests win over slower older ones,
 * including their errors.
 */
async function draw() {
  const token = ++drawToken;
  const current = () => token === drawToken;
  try {
    await drawLayer(current);
  } catch (error) {
    if (current()) showError(error);
  }
}

/**
 * Load and show the chosen product, stopping once superseded.
 * @param {() => boolean} current whether this draw is still the newest
 */
async function drawLayer(current) {
  const cycle = await countryCycle(form.country.value);
  if (!current()) return;
  const layer = chosenLayer(cycle.paths, Object.fromEntries(new FormData(form)));
  if (form.product.value === "impact") {
    await drawImpact(cycle, layer, current);
    return;
  }
  viewer.clearFeatures();
  if (!layer.path) {
    showNothing(layer.empty);
    return;
  }
  info.textContent = "Loading…";
  const raster = await loadRaster(`${cycle.root}/${layer.path}`);
  if (!current()) return;
  const legend = LEGENDS[form.product.value];
  const shown = showRaster(raster, legend, layer.key !== fittedKey);
  fittedKey = layer.key;
  viewer.setLegend(legend, layer.note);
  const when = cycleTime(cycle.latest.cycle).toISOString().slice(0, 16).replace("T", " ");
  info.replaceChildren(`Cycle ${when} UTC · ${layer.path.split("/").pop()} · ${shown.toLocaleString("en")} cells shown `,
    openLink(`${cycle.root}/${layer.path}`, "open file"));
}

/**
 * Show a site's municipal impact over its flood probability raster.
 * @param {{root: string}} cycle
 * @param {{path?: string, ibf?: {admin: string, summary: string}, key: string, note: string, empty: string}} layer
 * @param {() => boolean} current whether this draw is still the newest
 */
async function drawImpact(cycle, layer, current) {
  if (!layer.ibf) {
    viewer.clearFeatures();
    showNothing(layer.empty);
    return;
  }
  info.textContent = "Loading…";
  const [raster, admin, summary] = await Promise.all([
    layer.path ? loadRaster(`${cycle.root}/${layer.path}`) : null,
    fetchJson(`${cycle.root}/${layer.ibf.admin}`),
    fetchJson(`${cycle.root}/${layer.ibf.summary}`),
  ]);
  if (!current()) return;
  const fit = layer.key !== fittedKey;
  if (raster) showRaster(raster, LEGENDS.flood, false);
  else viewer.clear();
  viewer.showFeatures(admin, popupElement, fit);
  fittedKey = layer.key;
  viewer.setLegend(IMPACT_LEGEND, layer.note);
  info.replaceChildren(`${riskSummary(summary)} `, openLink(`${cycle.root}/${layer.ibf.admin}`, "open GeoJSON"));
}

/**
 * Colour a raster with its legend and put it on the map.
 * @param {object} raster result of loadRaster
 * @param {{breaks: number[], colors: string[]}} legend
 * @param {boolean} fit zoom to the raster
 * @returns {number} cells drawn
 */
function showRaster(raster, legend, fit) {
  const classes = classifyCells(raster.values, legend.breaks, raster.nodata);
  viewer.show(paintCells(classes, raster.width, raster.height, legend.colors), rasterBounds(raster.bbox, raster.epsg), fit);
  return drawnCount(classes);
}

/**
 * Clear the map and explain why nothing is shown.
 * @param {string} message
 */
function showNothing(message) {
  viewer.clear();
  viewer.setLegend(null);
  info.textContent = message;
}

/**
 * A small link for the info line.
 * @param {string} url
 * @param {string} text
 * @returns {HTMLElement}
 */
function openLink(url, text) {
  const link = element("a", "action", text);
  link.href = url;
  return link;
}

/**
 * Fill the data access box for the selected country's cycle.
 * @param {{latest: object}} cycle
 */
function showAccess(cycle) {
  const country = form.country.value;
  document.getElementById("access").replaceChildren(accessElement(accessUrls(base, country, cycle.latest.cycle), country));
}

/**
 * Show a cycle's file tree, narrowed by the filter box.
 * @param {{files: object[], root: string}} cycle
 */
function showFiles(cycle) {
  filesCycle = cycle;
  const text = filter.value;
  const tree = buildTree(filterFiles(cycle.files, text));
  const note = text.trim() ? ` matching "${text.trim()}"` : "";
  const noun = tree.count === 1 ? "file" : "files";
  document.getElementById("files-summary").textContent = `${tree.count.toLocaleString("en")} ${noun}${note}, ${formatBytes(tree.size)}`;
  document.getElementById("files").replaceChildren(folderElement(tree, cycle.root, Boolean(note)));
}

/**
 * Report a failed draw in the info line instead of failing silently.
 * @param {Error} error
 */
function showError(error) {
  const retry = element("button", "action", "try again");
  retry.type = "button";
  retry.addEventListener("click", refresh);
  info.replaceChildren(`Could not load this layer: ${error.message} `, retry);
}

/**
 * Put the selected grid's gauges on the map, when gauges are switched
 * on and the cycle has series for them.
 * @param {{paths: string[], root: string}} cycle
 */
async function showGauges(cycle) {
  const token = ++gaugeToken;
  const list = document.getElementById("gauge-buttons");
  viewer.clearGauges();
  fillGauges(list, [], gaugeLabel, () => {});
  if (!form.gauges.checked) return;
  const grids = gaugeFiles(cycle.paths);
  const grid = grids[form.basin.value] ? form.basin.value : Object.keys(grids)[0];
  if (!grid || !grids[grid].control) return;
  try {
    const text = await (await fetchOk(`${cycle.root}/${grids[grid].control}`)).text();
    if (token !== gaugeToken) return;
    const located = parseGauges(text).filter((g) => grids[grid].gauges[g.name]);
    const open = (gauge) => openHydrograph(cycle, gauge, grids[grid].gauges[gauge.name]);
    viewer.showGauges(located, open);
    fillGauges(list, located, gaugeLabel, open);
  } catch (error) {
    if (token === gaugeToken) showError(error);
  }
}

/**
 * Load every member's series of one run and reduce them to statistics.
 * Unreadable members are left out.
 * @param {string} root cycle URL
 * @param {string[]} paths the run's series files
 * @returns {Promise<{stats: object[], members: number}>}
 */
async function runStats(root, paths) {
  const results = await Promise.allSettled(paths.map(async (path) => parseSeries(await (await fetchOk(`${root}/${path}`)).text())));
  const members = results.filter((r) => r.status === "fulfilled" && r.value.length).map((r) => r.value);
  return { stats: ensembleStats(members), members: members.length };
}

/**
 * Open the hydrograph panel for a gauge and draw its runs.
 * @param {{latest: object, root: string}} cycle
 * @param {{name: string}} gauge
 * @param {Record<string, string[]>} files series files by run
 */
async function openHydrograph(cycle, gauge, files) {
  const panel = document.getElementById("hydrograph");
  const chart = document.getElementById("hydro-chart");
  const legend = document.getElementById("hydro-legend");
  panel.hidden = false;
  panel.dataset.gauge = gauge.name;
  const title = document.getElementById("hydro-title");
  const summary = document.getElementById("hydro-summary");
  title.textContent = gaugeLabel(gauge.name);
  title.focus();
  chart.textContent = "Loading…";
  summary.textContent = "";
  legend.replaceChildren();
  const loaded = await Promise.all(RUNS.filter((r) => files[r]).map(async (run) => ({ run, ...await runStats(cycle.root, files[run]) })));
  const runs = loaded.filter((r) => r.stats.length);
  if (panel.dataset.gauge !== gauge.name) return;
  if (!runs.length) {
    chart.textContent = "No readable series for this gauge.";
    return;
  }
  chart.replaceChildren(hydrographSvg(runs, cycleTime(cycle.latest.cycle).getTime(), HYDRO_SIZE));
  summary.textContent = hydrographSummary(runs);
  legend.replaceChildren(...runs.map(({ run, members }) => {
    const item = element("li");
    const swatch = element("span", "swatch");
    swatch.style.background = RUN_STYLE[run].color;
    item.append(swatch, `${RUN_STYLE[run].label}, ${members} members`);
    return item;
  }));
}

/**
 * Hide the hydrograph panel.
 */
function closeHydrograph() {
  const panel = document.getElementById("hydrograph");
  panel.hidden = true;
  delete panel.dataset.gauge;
}

/**
 * React to a country change: new cycle, new options, redraw.
 * Gives up when another country was picked meanwhile.
 */
async function changeCountry() {
  const country = form.country.value;
  try {
    const cycle = await countryCycle(country);
    if (country !== form.country.value) return;
    fillCycleOptions(cycle);
    showAccess(cycle);
    showFiles(cycle);
    showGauges(cycle);
  } catch (error) {
    if (country !== form.country.value) return;
    if (offset) showMissingCycle();
    else showError(error);
    return;
  }
  await draw();
}

/**
 * Clear the map when the selected hour has no published cycle.
 */
function showMissingCycle() {
  viewer.clearFeatures();
  viewer.clearGauges();
  showNothing("No cycle was published for this hour, or it has expired.");
}

/**
 * Periodic refresh: forget the latest cycles, reload the cards and
 * move the map to the newest cycle of the selected country.
 */
function refresh() {
  for (const key of [...cycles.keys()]) if (key.endsWith("/latest")) cycles.delete(key);
  refreshStatus();
  showTime();
  changeCountry();
}

/**
 * Set up controls, first draw and the status refresh timer.
 */
function start() {
  fillRegions(regions, COUNTRIES);
  setOptions(form.depth, FLOOD_DEPTHS_CM.map((d) => ({ value: String(d), label: `${d} cm` })));
  filter.addEventListener("input", () => filesCycle && showFiles(filesCycle));
  form.opacity.addEventListener("input", applyOpacity);
  const toggle = document.getElementById("toggle-controls");
  toggle.addEventListener("click", () => togglePanel(toggle));
  document.getElementById("open-files").addEventListener("click", () => document.getElementById("files-panel").showModal());
  document.getElementById("close-hydro").addEventListener("click", closeHydrograph);
  slider.addEventListener("change", () => setOffset(Number(slider.value)));
  for (const button of document.querySelectorAll("[data-step]")) {
    button.addEventListener("click", () => setOffset(offset + Number(button.dataset.step)));
  }
  document.getElementById("cycle-now").addEventListener("click", () => setOffset(0));
  const play = document.getElementById("cycle-play");
  play.addEventListener("click", () => togglePlay(play));
  form.addEventListener("change", async (event) => {
    if (event.target.name === "opacity") return;
    if (event.target.name === "country") {
      closeHydrograph();
      showSelectedStatus();
      showTime();
      changeCountry();
      return;
    }
    if (event.target.name === "gauges" || event.target.name === "basin") {
      countryCycle(form.country.value).then(showGauges, showError);
      if (event.target.name === "gauges") return;
    }
    if (event.target.name === "product") {
      try {
        fillCycleOptions(await countryCycle(form.country.value));
      } catch (error) {
        showError(error);
        return;
      }
    }
    toggleControls();
    draw();
  });
  toggleControls();
  updateTimeButtons();
  if (window.matchMedia("(max-width: 640px)").matches) togglePanel(toggle);
  refresh();
  setInterval(refresh, REFRESH_MS);
}

start();
