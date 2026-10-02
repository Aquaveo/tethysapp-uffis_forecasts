/**
 * The floating control panel: region chips that carry each country's
 * freshness, and the selected country's warning service.
 */

import { element } from "./dom.js";
import { ageLevel, ageMinutes } from "./status.js";

const LEVELS = ["ok", "late", "stale", "error"];

/**
 * A radio input styled as a chip, inside its label.
 * @param {string} name form field name
 * @param {string} value
 * @param {string} label
 * @param {boolean} checked
 * @returns {HTMLLabelElement}
 */
export function radioChip(name, value, label, checked) {
  const chip = element("label", "chip");
  const input = element("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  chip.append(input, element("span", "", label));
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
 * Colour each region chip by its country's freshness.
 * @param {HTMLElement} box
 * @param {object[]} statuses results of loadStatus
 * @param {Date} now
 */
export function markRegions(box, statuses, now) {
  for (const status of statuses) {
    const chip = box.querySelector(`input[value="${status.key}"]`)?.closest(".chip");
    if (!chip) continue;
    chip.classList.remove(...LEVELS);
    chip.classList.add(regionLevel(status, now));
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
