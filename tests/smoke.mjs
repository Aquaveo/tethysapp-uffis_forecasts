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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${assets}</head><body>${viewer.replaceAll("{{ outputs_base }}", outputs)}</body></html>`;
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
  await waitFor(evaluate, 'document.getElementById("info").textContent.includes("qpeaccum") && document.getElementById("info").textContent.includes(" 7 cells shown")', "rainfall map with 7 cells");
  await waitFor(evaluate, 'document.getElementById("files-summary").textContent.startsWith("5 files")', "file tree with 5 files");
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
  await waitFor(evaluate, 'document.getElementById("info").textContent.startsWith("Buildings at risk: 1 high, 2 medium, 5 low. People at low risk or worse: 42.") && document.querySelectorAll("path.leaflet-interactive").length === 1', "impact view with one municipality");
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
  console.log("viewer smoke test ok: status, rainfall, opacity, files sheet, flood and impact maps, file tree, outage");
} catch (error) {
  failed = true;
  console.error(`viewer smoke test failed: ${error.message}`);
} finally {
  chrome.kill();
  server.close();
}
process.exit(failed ? 1 : 0);
