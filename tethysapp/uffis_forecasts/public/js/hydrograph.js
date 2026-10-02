/**
 * The gauge hydrograph: discharge over time as plain SVG, one band
 * (10th to 90th percentile of members) and one median line per run.
 */

const SVG = "http://www.w3.org/2000/svg";
const HOUR_MS = 3600 * 1000;
const MARGIN = { top: 10, right: 12, bottom: 36, left: 46 };
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** How each run is labelled and coloured. */
export const RUN_STYLE = {
  stream_sat: { label: "Satellite rainfall (STREAM-SAT)", color: "#4b5563" },
  scampr: { label: "Nowcast (SCaMPR)", color: "#d97706" },
  stormlab: { label: "Forecast (StormLab)", color: "#2563eb" },
};

/**
 * A linear map from a domain onto a range.
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {(value: number) => number}
 */
export function linear([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Round tick values from zero to at least max, about count of them.
 * @param {number} max
 * @param {number} count
 * @returns {number[]}
 */
export function valueTicks(max, count) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/**
 * Whole hours between start and end, spaced to give about count ticks.
 * @param {number} start epoch ms
 * @param {number} end epoch ms
 * @param {number} count
 * @returns {number[]}
 */
export function timeTicks(start, end, count) {
  const step = [1, 3, 6, 12, 24].find((h) => (end - start) / (h * HOUR_MS) <= count) || 48;
  const stepMs = step * HOUR_MS;
  const ticks = [];
  for (let t = Math.ceil(start / stepMs) * stepMs; t <= end; t += stepMs) ticks.push(t);
  return ticks;
}

/**
 * SVG path through points.
 * @param {{x: number, y: number}[]} points
 * @returns {string}
 */
export function linePath(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

/**
 * Closed SVG path around a band: along the max edge, back along the min.
 * @param {{x: number, min: number, max: number}[]} points y already scaled
 * @returns {string}
 */
export function bandPath(points) {
  const upper = points.map((p) => ({ x: p.x, y: p.max }));
  const lower = [...points].reverse().map((p) => ({ x: p.x, y: p.min }));
  return `${linePath([...upper, ...lower])}Z`;
}

/**
 * One sentence naming each run's median peak and when it happens,
 * the chart's text alternative.
 * @param {{run: string, stats: {time: number, median: number}[]}[]} runs
 * @returns {string}
 */
export function hydrographSummary(runs) {
  const peaks = runs.map(({ run, stats }) => {
    const peak = stats.reduce((best, s) => (s.median > best.median ? s : best));
    const when = `${TIME_FORMAT.format(peak.time)} ${DAY_FORMAT.format(peak.time)}`;
    return `${RUN_STYLE[run].label} ${peak.median.toFixed(1)} m³/s at ${when}`;
  });
  return `Median peaks: ${peaks.join("; ")}.`;
}

/**
 * Create an SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string|number>} attributes
 * @returns {SVGElement}
 */
function node(tag, attributes) {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

/**
 * Create an SVG text element.
 * @param {Record<string, string|number>} attributes
 * @param {string} text
 * @returns {SVGElement}
 */
function textNode(attributes, text) {
  const label = node("text", attributes);
  label.textContent = text;
  return label;
}

/**
 * Draw the hydrograph for a gauge.
 * @param {{run: string, stats: {time: number, low: number, median: number, high: number}[]}[]} runs
 * @param {number} cycle cycle start, epoch ms
 * @param {{width: number, height: number}} size
 * @returns {SVGSVGElement}
 */
export function hydrographSvg(runs, cycle, { width, height }) {
  const all = runs.flatMap((r) => r.stats);
  const start = Math.min(...all.map((s) => s.time));
  const end = Math.max(...all.map((s) => s.time));
  const yTicks = valueTicks(Math.max(...all.map((s) => s.high)), 4);
  const x = linear([start, end], [MARGIN.left, width - MARGIN.right]);
  const y = linear([0, yTicks.at(-1)], [height - MARGIN.bottom, MARGIN.top]);
  const svg = node("svg", { viewBox: `0 0 ${width} ${height}`, class: "hydrograph", role: "img", "aria-label": hydrographSummary(runs) });

  for (const v of yTicks) {
    svg.append(node("line", { x1: MARGIN.left, x2: width - MARGIN.right, y1: y(v), y2: y(v), class: "grid" }));
    svg.append(textNode({ x: MARGIN.left - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" }, v.toLocaleString("en")));
  }
  for (const t of timeTicks(start, end, 6)) {
    svg.append(node("line", { x1: x(t), x2: x(t), y1: MARGIN.top, y2: height - MARGIN.bottom, class: "grid" }));
    svg.append(textNode({ x: x(t), y: height - MARGIN.bottom + 14, "text-anchor": "middle", class: "tick" }, TIME_FORMAT.format(t)));
    if (new Date(t).getUTCHours() === 0) {
      svg.append(textNode({ x: x(t), y: height - MARGIN.bottom + 27, "text-anchor": "middle", class: "tick day" }, DAY_FORMAT.format(t)));
    }
  }
  for (const { run, stats } of runs) {
    const color = RUN_STYLE[run].color;
    const band = stats.map((s) => ({ x: x(s.time), min: y(s.low), max: y(s.high) }));
    svg.append(node("path", { d: bandPath(band), fill: color, "fill-opacity": 0.18, stroke: "none" }));
    svg.append(node("path", { d: linePath(stats.map((s) => ({ x: x(s.time), y: y(s.median) }))), fill: "none", stroke: color, "stroke-width": 2, class: `median ${run}` }));
  }
  if (cycle >= start && cycle <= end) {
    svg.append(node("line", { x1: x(cycle), x2: x(cycle), y1: MARGIN.top, y2: height - MARGIN.bottom, class: "cycle" }));
  }
  return svg;
}
