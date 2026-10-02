/**
 * The floating control panel: region chips that carry each country's
 * freshness, and the selected country's warning service.
 */

import { element } from "./dom.js";
import { gaugeLabel } from "./gauges.js";
import { ageLevel, ageMinutes, ageText } from "./status.js";

const LEVELS = ["ok", "late", "stale", "error"];

/**
 * A radio input styled as a chip, inside its label.
 * @param {string} name form field name
 * @param {string} value
 * @param {string} label
 * @param {boolean} checked
 * @returns {HTMLLabelElement}
 */
function radioChip(name, value, label, checked) {
  const chip = element("label", "chip");
  const input = element("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  const text = element("span", "", label);
  text.append(element("span", "sr-only"));
  chip.append(input, text);
  return chip;
}

/**
 * Fill the regions box with one chip per country, the first selected.
 * @param {HTMLElement} box
 * @param {{key: string, name: string}[]} countries
 */
export function fillRegions(box, countries) {
  box.replaceChildren(...countries.map((c, i) => radioChip("country", c.key, c.name, i === 0)));
}

/**
 * Freshness level of one country's status: ok, late, stale or error.
 * @param {object} status result of loadStatus
 * @param {Date} now
 * @returns {string}
 */
export function regionLevel(status, now) {
  return status.error ? "error" : ageLevel(ageMinutes(status.published, now));
}

/**
 * Freshness of one country's status in words.
 * @param {object} status result of loadStatus
 * @param {Date} now
 * @returns {string}
 */
export function regionNote(status, now) {
  return status.error ? "no outputs found" : `published ${ageText(ageMinutes(status.published, now))}`;
}

/**
 * Mark each region chip with its country's freshness, as a coloured
 * dot and in words for tooltips and screen readers.
 * @param {HTMLElement} box
 * @param {object[]} statuses results of loadStatus
 * @param {Date} now
 */
export function markRegions(box, statuses, now) {
  for (const status of statuses) {
    const chip = box.querySelector(`input[value="${status.key}"]`)?.closest(".chip");
    if (!chip) continue;
    const note = regionNote(status, now);
    chip.classList.remove(...LEVELS);
    chip.classList.add(regionLevel(status, now));
    chip.title = `${status.name}, ${note}`;
    chip.querySelector(".sr-only").textContent = `, ${note}`;
  }
}

/**
 * Agencies the page lists, keyed by country, from the portal's JSON.
 * Empty when the page carries none.
 * @param {Document} doc
 * @returns {Record<string, {short: string, name: string, host: string}>}
 */
export function agenciesByCountry(doc) {
  const data = doc.getElementById("uffis-agencies");
  const list = data ? JSON.parse(data.textContent) : [];
  return Object.fromEntries(list.map((agency) => [agency.country, agency]));
}

/**
 * Fill the line that links a country to its warning service.
 * @param {HTMLElement} line
 * @param {string} place country name
 * @param {{short: string, name: string, host: string}|undefined} agency
 */
export function showAgency(line, place, agency) {
  line.hidden = !agency;
  if (!agency) return;
  const link = element("a", "", `${agency.short} portal`);
  link.href = `https://${agency.host}`;
  link.title = agency.name;
  line.replaceChildren(`Warnings for ${place}: `, link);
}

/**
 * List gauges as buttons, so hydrographs open without the map.
 * @param {HTMLElement} box
 * @param {{name: string}[]} gauges
 * @param {(gauge: {name: string}) => void} onSelect
 */
export function fillGauges(box, gauges, onSelect) {
  box.replaceChildren(...gauges.map((gauge) => {
    const button = element("button", "gauge-btn", gaugeLabel(gauge.name));
    button.type = "button";
    button.addEventListener("click", () => onSelect(gauge));
    return button;
  }));
  box.closest("fieldset").hidden = !gauges.length;
}

/**
 * Empty and hide the gauge list.
 * @param {HTMLElement} box
 */
export function clearGaugeList(box) {
  box.replaceChildren();
  box.closest("fieldset").hidden = true;
}
