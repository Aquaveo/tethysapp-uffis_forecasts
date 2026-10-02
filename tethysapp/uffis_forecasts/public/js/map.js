/**
 * The MapLibre map: vector basemap, one product overlay at a time under
 * the place names, and its legend.
 * Uses the MapLibre global (maplibregl) loaded by the page.
 */

import { SMALL_SCREEN } from "./config.js";
import { element } from "./dom.js";
import { gaugeLabel } from "./gauges.js";

const BASEMAP = "https://tiles.openfreemap.org/styles/positron";
const RASTER = "forecast";
const FEATURES = "impact";
const FEATURE_FILL = "impact-fill";
const FEATURE_LINE = "impact-line";
const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9edf2" } }] };
const FIT_MARGIN = 16;
const MIN_VIEW = 120;
const FIT_MS = 500;
const BUSY_TEXT = { layer: "Loading layer…", overlay: "Loading layer…", tiles: "Loading base map…" };
const HOME_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M2 7.5 8 2l6 5.5"/><path d="M3.8 6.4V14h8.4V6.4"/><path d="M6.6 14v-3.6h2.8V14"/></svg>';

/** A web map that shows one coloured raster and its legend. */
export class ViewerMap {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.busy = new Set();
    this.loader = this.addLoader(container);
    this.map = new maplibregl.Map({
      container,
      style: BASEMAP,
      center: [-75, 15],
      zoom: 3,
      maxZoom: 18,
      dragRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      attributionControl: { compact: true },
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    const small = window.matchMedia(SMALL_SCREEN);
    this.fallBackOnStyleError();
    this.ready = new Promise((resolve) => this.map.once("style.load", resolve)).then(() => {
      this.labels = this.map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
    });
    this.map.once("load", () => {
      if (small.matches) container.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
    });
    this.map.on("dataloading", () => this.setBusy("tiles", true));
    this.map.on("idle", () => {
      this.setBusy("tiles", false);
      this.setBusy("overlay", false);
    });
    this.opacity = 0.85;
    this.home = null;
    this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.features = null;
    this.popup = null;
    this.markers = [];
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    this.addPanel(homeButton(() => this.goHome()), "top-left");
    this.map.on("click", FEATURE_FILL, (event) => this.openPopup(event));
    this.map.on("mouseenter", FEATURE_FILL, () => { this.map.getCanvas().style.cursor = "pointer"; });
    this.map.on("mouseleave", FEATURE_FILL, () => { this.map.getCanvas().style.cursor = ""; });
    this.legendOpen = !small.matches;
    small.addEventListener("change", (event) => this.setLegendOpen(!event.matches));
    this.legend = element("div", "legend");
    this.legend.hidden = true;
    this.addPanel(this.legend, "bottom-left");
  }

  /**
   * Replace the overlay image, keeping its layer under the place names.
   * @param {string} imageUrl
   * @param {number[][]} corners [lng, lat] of top left, top right, bottom right, bottom left
   * @param {boolean} fit zoom to the image
   */
  show(imageUrl, corners, fit) {
    this.setBusy("overlay", true);
    if (fit) this.fit(positionBounds(corners));
    this.ready.then(() => {
      const source = this.map.getSource(RASTER);
      if (source) {
        source.updateImage({ url: imageUrl, coordinates: corners });
        return;
      }
      this.map.addSource(RASTER, { type: "image", url: imageUrl, coordinates: corners });
      this.map.addLayer({
        id: RASTER,
        type: "raster",
        source: RASTER,
        paint: { "raster-opacity": this.opacity, "raster-resampling": "nearest", "raster-fade-duration": 0 },
      }, this.map.getLayer(FEATURE_FILL) ? FEATURE_FILL : this.labels);
    });
  }

  /**
   * Zoom to bounds and remember them for the home button.
   * @param {number[][]} bounds [[south, west], [north, east]]
   */
  fit(bounds) {
    this.home = bounds;
    this.goHome();
  }

  /** Zoom back to the last fitted bounds, clear of the overlays. */
  goHome() {
    if (!this.home) return;
    const box = this.map.getContainer();
    const padding = fitPadding(this.insets, box.clientWidth, box.clientHeight);
    this.map.fitBounds(lngLatBounds(this.home), { padding, duration: FIT_MS });
  }

  /**
   * Swap in a blank basemap if the style fails, so forecasts still draw.
   */
  fallBackOnStyleError() {
    const fallBack = () => {
      if (this.map.isStyleLoaded()) return;
      this.map.off("error", fallBack);
      this.map.setStyle(BLANK_STYLE);
    };
    this.map.on("error", fallBack);
    this.map.once("style.load", () => this.map.off("error", fallBack));
  }

  /**
   * Set how far floating panels cover each edge of the map.
   * @param {{top: number, right: number, bottom: number, left: number}} insets pixels
   */
  setInsets(insets) {
    this.insets = insets;
  }

  /**
   * Show an existing element in a map corner, above earlier ones.
   * @param {HTMLElement} content
   * @param {string} position MapLibre corner, e.g. bottom-left
   */
  addPanel(content, position) {
    content.classList.add("maplibregl-ctrl");
    this.map.addControl({ onAdd: () => content, onRemove: () => content.remove() }, position);
  }

  /**
   * Set the raster overlay's opacity, now and for later layers.
   * @param {number} opacity 0 to 1
   */
  setOpacity(opacity) {
    this.opacity = opacity;
    this.ready.then(() => {
      if (this.map.getLayer(RASTER)) this.map.setPaintProperty(RASTER, "raster-opacity", opacity);
    });
  }

  /** Remove the overlay, if any. */
  clear() {
    this.setBusy("overlay", false);
    this.ready.then(() => removeLayers(this.map, RASTER, [RASTER]));
  }

  /**
   * Add the loading indicator over the map, hidden until something loads.
   * @param {HTMLElement} container
   * @returns {HTMLElement}
   */
  addLoader(container) {
    const loader = element("div", "map-loader");
    loader.setAttribute("role", "status");
    loader.append(element("span", "spinner"), element("span", "map-loader-text", ""));
    container.after(loader);
    return loader;
  }

  /**
   * Mark one source of loading as busy or done, and show the loader
   * while any source is busy. A layer outranks the base map in the text.
   * @param {"layer"|"overlay"|"tiles"} source
   * @param {boolean} on
   */
  setBusy(source, on) {
    if (this.busy.has(source) === on) return;
    if (on) this.busy.add(source);
    else this.busy.delete(source);
    const first = ["layer", "overlay", "tiles"].find((s) => this.busy.has(s));
    this.loader.classList.toggle("on", Boolean(first));
    this.loader.querySelector(".map-loader-text").textContent = first ? BUSY_TEXT[first] : "";
  }

  /**
   * Replace the vector layer with GeoJSON features coloured by their
   * risk_color property, each with a popup.
   * @param {object} geojson FeatureCollection in WGS84
   * @param {(properties: object) => HTMLElement} popup
   * @param {boolean} fit zoom to the features
   */
  showFeatures(geojson, popup, fit) {
    this.clearFeatures();
    this.features = { geojson, popup };
    if (fit) this.fit(geojsonBounds(geojson));
    this.ready.then(() => {
      const color = ["coalesce", ["get", "risk_color"], "#555555"];
      this.map.addSource(FEATURES, { type: "geojson", data: geojson, generateId: true });
      this.map.addLayer({ id: FEATURE_FILL, type: "fill", source: FEATURES, paint: { "fill-color": color, "fill-opacity": 0.3 } }, this.labels);
      this.map.addLayer({ id: FEATURE_LINE, type: "line", source: FEATURES, paint: { "line-color": color, "line-width": 2 } }, this.labels);
    });
  }

  /**
   * Open the popup for the clicked feature, from its original properties.
   * @param {{features: {id: number}[], lngLat: object}} event
   */
  openPopup(event) {
    const feature = this.features?.geojson.features[event.features[0].id];
    if (!feature) return;
    this.popup?.remove();
    this.popup = new maplibregl.Popup({ maxWidth: "280px" })
      .setLngLat(event.lngLat)
      .setDOMContent(this.features.popup(feature.properties))
      .addTo(this.map);
  }

  /** Remove the vector layer and its popup, if any. */
  clearFeatures() {
    this.popup?.remove();
    this.popup = null;
    this.features = null;
    this.ready.then(() => removeLayers(this.map, FEATURES, [FEATURE_LINE, FEATURE_FILL]));
  }

  /**
   * Show gauges as marker buttons that call onSelect when pressed.
   * @param {{name: string, lat: number, lon: number}[]} gauges
   * @param {(gauge: {name: string, lat: number, lon: number}) => void} onSelect
   */
  showGauges(gauges, onSelect) {
    this.clearGauges();
    this.markers = gauges.map((gauge) => new maplibregl.Marker({ element: gaugeButton(gauge, onSelect) })
      .setLngLat([gauge.lon, gauge.lat])
      .addTo(this.map));
  }

  /** Remove the gauge markers, if any. */
  clearGauges() {
    this.markers.forEach((marker) => marker.remove());
    this.markers = [];
  }

  /**
   * The legend title as a button that folds the legend to a colour ramp.
   * @param {string} title
   * @returns {HTMLButtonElement}
   */
  legendHead(title) {
    const head = element("button", "legend-head");
    head.type = "button";
    head.setAttribute("aria-expanded", String(this.legendOpen));
    head.append(element("strong", "", title));
    head.addEventListener("click", () => this.setLegendOpen(!this.legendOpen));
    return head;
  }

  /**
   * Unfold the legend, or fold it to its colour ramp.
   * @param {boolean} open
   */
  setLegendOpen(open) {
    this.legendOpen = open;
    this.legend.classList.toggle("compact", !open);
    this.legend.querySelector(".legend-head")?.setAttribute("aria-expanded", String(open));
  }

  /**
   * Draw the legend for a product, or hide it.
   * @param {{title: string, unit: string, colors: string[], labels: string[]}|null} legend
   * @param {string} [note] line under the title, e.g. the statistic shown
   */
  setLegend(legend, note) {
    const box = this.legend;
    box.replaceChildren();
    box.hidden = !legend;
    if (!legend) return;
    box.classList.toggle("compact", !this.legendOpen);
    box.append(this.legendHead(`${legend.title} (${legend.unit})`));
    if (note) box.append(element("div", "note", note));
    legend.colors.forEach((color, i) => {
      const row = element("div", "row");
      row.title = legend.labels[i];
      const swatch = element("span", "swatch");
      swatch.style.background = color;
      row.append(swatch, element("span", "", legend.labels[i]));
      box.append(row);
    });
  }
}

/**
 * A control box with one button that zooms back to the country.
 * @param {() => void} onClick
 * @returns {HTMLElement}
 */
function homeButton(onClick) {
  const box = element("div", "maplibregl-ctrl-group home");
  const button = element("button");
  button.innerHTML = HOME_ICON;
  button.type = "button";
  button.title = "Zoom to the country";
  button.setAttribute("aria-label", "Zoom to the country");
  button.addEventListener("click", onClick);
  box.append(button);
  return box;
}

/**
 * A gauge marker as a button that opens its hydrograph.
 * @param {{name: string}} gauge
 * @param {(gauge: object) => void} onSelect
 * @returns {HTMLButtonElement}
 */
function gaugeButton(gauge, onSelect) {
  const button = element("button", "gauge-marker");
  button.type = "button";
  button.title = gaugeLabel(gauge.name);
  button.setAttribute("aria-label", `Hydrograph for ${gaugeLabel(gauge.name)}`);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(gauge);
  });
  return button;
}

/**
 * Remove a source and its layers when present.
 * @param {object} map MapLibre map
 * @param {string} source
 * @param {string[]} layers
 */
function removeLayers(map, source, layers) {
  layers.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource(source)) map.removeSource(source);
}

/**
 * Fit padding clear of the overlays, or a plain margin when the
 * overlays would leave too little map to fit into.
 * @param {{top: number, right: number, bottom: number, left: number}} insets pixels
 * @param {number} width map width in pixels
 * @param {number} height map height in pixels
 * @returns {{top: number, right: number, bottom: number, left: number}}
 */
export function fitPadding({ top, right, bottom, left }, width, height) {
  const roomy = width - left - right - 2 * FIT_MARGIN >= MIN_VIEW && height - top - bottom - 2 * FIT_MARGIN >= MIN_VIEW;
  if (!roomy) return { top: FIT_MARGIN, right: FIT_MARGIN, bottom: FIT_MARGIN, left: FIT_MARGIN };
  return { top: top + FIT_MARGIN, right: right + FIT_MARGIN, bottom: bottom + FIT_MARGIN, left: left + FIT_MARGIN };
}

/**
 * How far the navigation, time bar and panel cover each map edge.
 * The bar docks at the top or bottom; a narrow panel sits beside the
 * map and a wide one is a bottom sheet.
 * @param {{width: number, height: number}} view viewport size
 * @param {number} nav height covered by the navigation
 * @param {{top: number, bottom: number, height: number}|null} bar time bar box, null when hidden
 * @param {{top: number, left: number, width: number}|null} panel panel box, null when hidden
 * @returns {{top: number, right: number, bottom: number, left: number}} pixels
 */
export function edgeInsets(view, nav, bar, panel) {
  const insets = { top: nav, right: 0, bottom: 0, left: 0 };
  if (bar && bar.height) {
    if (bar.top < view.height / 2) insets.top = Math.max(nav, bar.bottom);
    else insets.bottom = view.height - bar.top;
  }
  if (panel && panel.width < view.width / 2) insets.right = view.width - panel.left;
  else if (panel) insets.bottom = Math.max(insets.bottom, view.height - panel.top);
  return insets;
}

/**
 * [[south, west], [north, east]] as MapLibre [[west, south], [east, north]].
 * @param {number[][]} bounds [[south, west], [north, east]]
 * @returns {number[][]}
 */
export function lngLatBounds([[south, west], [north, east]]) {
  return [[west, south], [east, north]];
}

/**
 * The bounding box of [lng, lat] positions.
 * @param {number[][]} positions
 * @returns {number[][]} [[south, west], [north, east]]
 */
export function positionBounds(positions) {
  let [south, west, north, east] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of positions) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [[south, west], [north, east]];
}

/**
 * The bounding box of every position in a FeatureCollection.
 * @param {{features: {geometry: {coordinates: any}}[]}} geojson
 * @returns {number[][]} [[south, west], [north, east]]
 */
export function geojsonBounds(geojson) {
  return positionBounds(geojson.features.flatMap((feature) => positionsOf(feature.geometry.coordinates)));
}

/**
 * Flatten nested GeoJSON coordinates to their positions.
 * @param {any[]} coordinates
 * @returns {number[][]}
 */
function positionsOf(coordinates) {
  return typeof coordinates[0] === "number" ? [coordinates] : coordinates.flatMap(positionsOf);
}
