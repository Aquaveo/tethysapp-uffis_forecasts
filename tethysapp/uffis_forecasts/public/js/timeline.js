/**
 * Moving between hourly cycles. TITO publishes a cycle every hour and
 * keeps at least a day of them, so the viewer can step back through
 * what each recent run issued.
 */

import { cycleTime } from "./outputs.js";

/** Hours before the latest cycle the slider reaches. */
export const HOURS_BACK = 23;

const HOUR_MS = 3600 * 1000;

/**
 * The cycle folder name a number of hours from another.
 * @param {string} cycle e.g. 20261002.020000
 * @param {number} hours negative for earlier cycles
 * @returns {string}
 */
export function shiftCycle(cycle, hours) {
  const iso = new Date(cycleTime(cycle).getTime() + hours * HOUR_MS).toISOString();
  return `${iso.slice(0, 10).replaceAll("-", "")}.${iso.slice(11, 13)}0000`;
}

/**
 * An hour offset kept between the oldest kept cycle and the latest.
 * @param {number} offset
 * @returns {number}
 */
export function clampOffset(offset) {
  return Math.max(-HOURS_BACK, Math.min(0, offset));
}

/**
 * Label for the cycle at an offset from the latest one.
 * @param {string} latest latest cycle folder name
 * @param {number} offset hours, 0 or negative
 * @returns {string}
 */
export function timeLabel(latest, offset) {
  const when = cycleTime(shiftCycle(latest, offset)).toISOString().slice(0, 16).replace("T", " ");
  return `${when} UTC · ${offset ? `${-offset} h before latest` : "latest"}`;
}
