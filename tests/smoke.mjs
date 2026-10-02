/**
 * Browser smoke test: serves the app's viewer templates with the fixture
 * outputs, opens them in headless Chrome and checks the status board,
 * the map paths, and an unreachable outputs host.
 * Run: node tests/smoke.mjs (set CHROME to the browser binary if needed).
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "tethysapp", "uffis_forecasts");
const FIXTURES = join(ROOT, "tests", "fixtures");
const STATIC = "/static/uffis_forecasts/";
const DOWN_BASE = "http://127.0.0.1:9/outputs";
const AGENCIES = '<script type="application/json" id="uffis-agencies">[{"country": "guatemala", "short": "INSIVUMEH", "name": "Instituto Nacional", "host": "insivumeh.uffis.org"}]</script>';
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".tif": "image/tiff" };
const TIMEOUT_MS = 30000;

/**
 * The viewer page as the portal renders it, minus the portal frame.
 * @param {string} outputs outputs base URL for the page
 * @returns {Promise<string>}
 */
async function viewerPage(outputs) {
  const templates = join(APP, "templates", "uffis_forecasts");
  const assets = await readFile(join(templates, "assets.html"), "utf8");
  const viewer = await readFile(join(templates, "viewer.html"), "utf8");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${assets}</head><body>${viewer.replaceAll("{{ outputs_base }}", outputs)}${AGENCIES}</body></html>`;
}

/**
 * Resolve a request path to a file under the app or the fixtures.
 * @param {string} path
 * @returns {string}
 */
function fileFor(path) {
  if (path.startsWith("/outputs/")) return join(FIXTURES, path);
  if (path.startsWith(STATIC)) return join(APP, "public", path.slice(STATIC.length));
  return "";
}

/**
 * Serve the viewer page at /, app static files and the fixture outputs
 * on a free port. /?down=1 points the page at an unreachable host.
 * @returns {Promise<{server: import("node:http").Server, port: number}>}
 */
function serve() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://x");
    const path = normalize(decodeURIComponent(url.pathname));
    try {
      if (path === "/") {
        const outputs = url.searchParams.has("down") ? DOWN_BASE : `http://${request.headers.host}/outputs`;
        response.writeHead(200, { "Content-Type": TYPES[".html"] }).end(await viewerPage(outputs));
        return;
      }
      const file = fileFor(path);
      const body = await readFile(file);
      response.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

/**
 * Start headless Chrome and return it with its DevTools HTTP address.
 * @returns {Promise<{chrome: import("node:child_process").ChildProcess, devtools: string}>}
 */
function launchChrome() {
  const binary = process.env.CHROME || "google-chrome";
  const chrome = spawn(binary, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0", "about:blank"]);
  return new Promise((resolve, reject) => {
    chrome.on("error", reject);
    chrome.stderr.on("data", (chunk) => {
      const match = String(chunk).match(/DevTools listening on ws:\/\/([^/]+)\//);
      if (match) resolve({ chrome, devtools: `http://${match[1]}` });
    });
  });
}

/**
 * Open a page and return a helper that evaluates expressions in it.
 * @param {string} devtools DevTools HTTP address
 * @param {string} url page to open
 * @returns {Promise<{evaluate: (expression: string) => Promise<any>, close: () => void}>}
 */
async function openPage(devtools, url) {
  const target = await (await fetch(`${devtools}/json/new?${url}`, { method: "PUT" })).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  const pending = new Map();
  let id = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message.result);
    pending.delete(message.id);
  });
  const evaluate = (expression) => new Promise((resolve) => {
    pending.set(++id, (result) => resolve(result?.result?.value));
    socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  });
  return { evaluate, close: () => socket.close() };
}

/**
 * Poll an expression until it returns a truthy value or time runs out.
 * @param {(expression: string) => Promise<any>} evaluate
 * @param {string} expression
 * @param {string} what description for the failure message
 * @returns {Promise<any>}
 */
async function waitFor(evaluate, expression, what) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await evaluate(expression);
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${what}; info line: ${await evaluate('document.getElementById("info").textContent')}`);
}

/**
 * Run the checks against the served page.
 * @param {(expression: string) => Promise<any>} evaluate
 */
async function check(evaluate) {
  const card = await waitFor(evaluate, 'document.querySelector("#status .card")?.textContent', "status cards");
  if (!card.includes("1 of 1 flood sites triggered")) throw new Error(`Guatemala card: ${card}`);
  const region = await evaluate('document.querySelector("#regions .chip").title');
  if (!region.startsWith("Guatemala, published")) throw new Error(`region note: ${region}`);
  const agency = await evaluate('document.getElementById("agency").textContent + " " + document.querySelector("#agency a")?.href');
  if (!agency.startsWith("Warnings for Guatemala: INSIVUMEH portal https://insivumeh.uffis.org")) throw new Error(`agency line: ${agency}`);
  await waitFor(evaluate, 'document.getElementById("info").textContent.includes("qpeaccum") && document.getElementById("info").textContent.includes(" 7 cells shown")', "rainfall map with 7 cells");
  await checkTimeline(evaluate);
  await waitFor(evaluate, 'document.getElementById("files-summary").textContent.startsWith("10 files")', "file tree with 10 files");
  await waitFor(evaluate, 'document.querySelectorAll(".leaflet-gauges-pane path").length === 1', "one gauge marker");
  await waitFor(evaluate, 'document.querySelectorAll("#gauge-buttons .gauge-btn").length === 1 && document.querySelector("#gauge-buttons .gauge-btn").textContent === "Test gauge"', "gauge list button");
  await evaluate('(() => { const p = document.querySelector(".leaflet-gauges-pane path"); p.focus(); p.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()');
  await waitFor(evaluate, 'document.querySelectorAll("#hydro-chart path.median").length === 2 && document.getElementById("hydro-title").textContent === "Test gauge" && document.activeElement.id === "hydro-title"', "hydrograph opened from the keyboard");
  const summary = await evaluate('document.getElementById("hydro-summary").textContent');
  if (!summary.startsWith("Median peaks: Satellite rainfall (STREAM-SAT) 18.0 m³/s at 00:00 1 Jan; Forecast (StormLab) 29.0 m³/s")) throw new Error(`hydrograph summary: ${summary}`);
  const legend = await evaluate('document.getElementById("hydro-legend").textContent');
  if (!legend.includes("2 members")) throw new Error(`hydrograph legend: ${legend}`);
  await evaluate('document.getElementById("close-hydro").click()');
  const access = await evaluate('document.getElementById("access").textContent');
  if (!access.includes("/outputs/guatemala/latest.json")) throw new Error(`data access box: ${access}`);
  await evaluate('(() => { const f = document.getElementById("file-filter"); f.value = "prob_depth"; f.dispatchEvent(new Event("input")); })()');
  await waitFor(evaluate, 'document.getElementById("files-summary").textContent.startsWith("1 file matching") && [...document.querySelectorAll("#files a")].some((a) => a.href.endsWith("prob_depth_ge_10cm_overbank.20260101.000000.tif"))', "filtered tree with the flood raster link");
  await evaluate('(() => { const o = document.getElementById("opacity"); o.value = "40"; o.dispatchEvent(new Event("input")); })()');
  await waitFor(evaluate, 'document.querySelector("img.raster")?.style.opacity === "0.4" && document.getElementById("opacity-value").textContent === "40%"', "raster at 40% opacity");
  await evaluate('document.getElementById("open-files").click()');
  await waitFor(evaluate, 'document.getElementById("files-panel").open', "files sheet open");
  await evaluate('document.getElementById("files-panel").close()');
  await evaluate('document.querySelector("input[name=product][value=flood]").click()');
  await waitFor(evaluate, 'document.getElementById("info").textContent.includes("prob_depth_ge_10cm") && document.getElementById("info").textContent.includes(" 5 cells shown")', "flood map with 5 cells");
  await evaluate('document.querySelector("input[name=product][value=impact]").click()');
  await waitFor(evaluate, 'document.getElementById("info").textContent.startsWith("Buildings at risk: 1 high, 2 medium, 5 low. People at low risk or worse: 42.") && document.querySelectorAll(".leaflet-overlay-pane path.leaflet-interactive").length === 1', "impact view with one municipality");
}

/**
 * Step back one cycle, then to an hour with none, then to the latest.
 * @param {(expression: string) => Promise<any>} evaluate
 */
async function checkTimeline(evaluate) {
  const label = 'document.getElementById("cycle-label").textContent';
  const info = 'document.getElementById("info").textContent';
  const step = (hours) => evaluate(`document.querySelector('[data-step="${hours}"]').click()`);
  await waitFor(evaluate, `${label} === "2026-01-01 00:00 UTC · latest" && document.getElementById("cycle-now").disabled && document.querySelector('[data-step="1"]').disabled`, "latest cycle label with Now and later steps disabled");
  await step(-1);
  const fileLink = 'document.querySelector("#info a")?.href || ""';
  await waitFor(evaluate, `${label} === "2025-12-31 23:00 UTC · 1 h before latest" && ${fileLink}.includes("/20251231.230000/") && ${info}.includes(" 7 cells shown")`, "previous cycle drawn");
  await step(-1);
  await waitFor(evaluate, `${info}.startsWith("No cycle was published")`, "missing cycle message");
  await evaluate('document.getElementById("cycle-now").click()');
  await waitFor(evaluate, `document.getElementById("cycle-slider").value === "0" && ${fileLink}.includes("/20260101.000000/")`, "back to the latest cycle");
  await evaluate('document.getElementById("cycle-speed").click()');
  const speed = await evaluate('document.getElementById("cycle-speed").getAttribute("aria-label")');
  if (speed !== "Playback speed 2×") throw new Error(`speed button: ${speed}`);
  await evaluate('document.getElementById("cycle-play").click()');
  await waitFor(evaluate, 'document.getElementById("cycle-play").getAttribute("aria-label") === "Pause" && getComputedStyle(document.querySelector("#cycle-play .icon-pause")).display === "block"', "pause icon while playing");
  await evaluate('document.getElementById("cycle-play").click()');
  await waitFor(evaluate, 'document.getElementById("cycle-play").getAttribute("aria-label") === "Play"', "play icon after pausing");
  await evaluate('document.getElementById("cycle-now").click()');
  await waitFor(evaluate, `document.getElementById("cycle-slider").value === "0" && ${fileLink}.includes("/20260101.000000/") && !document.getElementById("info").classList.contains("loading")`, "settled on the latest cycle");
}

/**
 * With the outputs host down every card and the map report the failure.
 * @param {(expression: string) => Promise<any>} evaluate
 */
async function checkOutage(evaluate) {
  await waitFor(evaluate, 'document.querySelectorAll("#regions .chip.error").length === 5', "five failed region chips");
  await waitFor(evaluate, 'document.querySelector("#status .card")?.textContent.includes("No outputs found")', "failed status card");
  await waitFor(evaluate, 'document.getElementById("info").textContent.startsWith("Could not load this layer")', "map error line");
}

const { server, port } = await serve();
const { chrome, devtools } = await launchChrome();
let failed = false;
try {
  const page = await openPage(devtools, `http://127.0.0.1:${port}/`);
  await check(page.evaluate);
  page.close();
  const down = await openPage(devtools, `http://127.0.0.1:${port}/?down=1`);
  await checkOutage(down.evaluate);
  down.close();
  console.log("viewer smoke test ok: status, rainfall, cycle slider, gauge hydrograph, opacity, files sheet, flood and impact maps, file tree, outage");
} catch (error) {
  failed = true;
  console.error(`viewer smoke test failed: ${error.message}`);
} finally {
  chrome.kill();
  server.close();
}
process.exit(failed ? 1 : 0);
