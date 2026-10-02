/**
 * The Leaflet map: basemap, one product overlay at a time, and its legend.
 * Uses the Leaflet global (L) loaded by the page.
 */

import { element } from "./dom.js";

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const FIT = { padding: [16, 16] };
const HOME_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M2 7.5 8 2l6 5.5"/><path d="M3.8 6.4V14h8.4V6.4"/><path d="M6.6 14v-3.6h2.8V14"/></svg>';

/** A web map that shows one coloured raster and its legend. */
export class ViewerMap {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.map = L.map(container, { zoomSnap: 1 }).setView([15, -75], 4);
    L.tileLayer(OSM_TILES, { maxZoom: 18, attribution: OSM_CREDIT }).addTo(this.map);
    this.overlay = null;
    this.features = null;
    this.opacity = 0.85;
    this.home = null;
    this.gauges = null;
    this.map.createPane("gauges").style.zIndex = 650;
    this.addHomeButton();
    this.legend = L.control({ position: "bottomleft" });
    this.legend.onAdd = () => element("div", "legend");
    this.legend.addTo(this.map);
  }

  /**
   * Replace the overlay with a new image.
   * @param {string} imageUrl
   * @param {number[][]} bounds [[south, west], [north, east]]
   * @param {boolean} fit zoom to the image
   */
  show(imageUrl, bounds, fit) {
    this.clear();
    this.overlay = L.imageOverlay(imageUrl, bounds, { opacity: this.opacity, className: "raster" }).addTo(this.map);
    if (fit) this.fit(bounds);
  }

  /**
   * Zoom to bounds and remember them for the home button.
   * @param {L.LatLngBoundsExpression} bounds
   */
  fit(bounds) {
    this.home = bounds;
    this.map.fitBounds(bounds, FIT);
  }

  /** Zoom back to the last fitted layer. */
  goHome() {
    if (this.home) this.map.fitBounds(this.home, FIT);
  }

  /** Add a button under the zoom control that calls goHome. */
  addHomeButton() {
    const control = L.control({ position: "topleft" });
    control.onAdd = () => {
      const box = element("div", "leaflet-bar home");
      const button = element("button");
      button.innerHTML = HOME_ICON;
      button.type = "button";
      button.title = "Zoom to the country";
      button.setAttribute("aria-label", "Zoom to the country");
      button.addEventListener("click", () => this.goHome());
      box.append(button);
      L.DomEvent.disableClickPropagation(box);
      return box;
    };
    control.addTo(this.map);
  }

  /**
   * Show an existing element in a map corner, above the legend when
   * both share the corner.
   * @param {HTMLElement} content
   * @param {string} position Leaflet corner, e.g. bottomleft
   */
  addPanel(content, position) {
    const control = L.control({ position });
    control.onAdd = () => {
      L.DomEvent.disableClickPropagation(content);
      return content;
    };
    control.addTo(this.map);
  }

  /**
   * Set the raster overlay's opacity, now and for later layers.
   * @param {number} opacity 0 to 1
   */
  setOpacity(opacity) {
    this.opacity = opacity;
    if (this.overlay) this.overlay.setOpacity(opacity);
  }

  /** Remove the overlay, if any. */
  clear() {
    if (this.overlay) this.overlay.remove();
    this.overlay = null;
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
    this.features = L.geoJSON(geojson, {
      style: (feature) => {
        const color = feature.properties.risk_color || "#555555";
        return { color, weight: 2, fillColor: color, fillOpacity: 0.3 };
      },
      onEachFeature: (feature, layer) => layer.bindPopup(() => popup(feature.properties)),
    }).addTo(this.map);
    if (fit) this.fit(this.features.getBounds());
  }

  /**
   * Show gauges as markers that call onSelect when clicked.
   * @param {{name: string, lat: number, lon: number}[]} gauges
   * @param {(gauge: {name: string, lat: number, lon: number}) => void} onSelect
   */
  showGauges(gauges, onSelect) {
    this.clearGauges();
    const markers = gauges.map((gauge) => L.circleMarker([gauge.lat, gauge.lon], {
      pane: "gauges", radius: 7, weight: 2, color: "#111827", fillColor: "#22d3ee", fillOpacity: 1,
    }).bindTooltip(gaugeLabel(gauge.name)).on("click", () => onSelect(gauge)));
    this.gauges = L.layerGroup(markers).addTo(this.map);
    markers.forEach((marker, i) => focusable(marker.getElement(), gauges[i], () => onSelect(gauges[i])));
  }

  /** Remove the gauge markers, if any. */
  clearGauges() {
    if (this.gauges) this.gauges.remove();
    this.gauges = null;
  }

  /** Remove the vector layer, if any. */
  clearFeatures() {
    if (this.features) this.features.remove();
    this.features = null;
  }

  /**
   * Draw the legend for a product, or hide it.
   * @param {{title: string, unit: string, colors: string[], labels: string[]}|null} legend
   * @param {string} [note] line under the title, e.g. the statistic shown
   */
  setLegend(legend, note) {
    const box = this.legend.getContainer();
    box.replaceChildren();
    box.hidden = !legend;
    if (!legend) return;
    box.append(element("strong", "", `${legend.title} (${legend.unit})`));
    if (note) box.append(element("div", "note", note));
    legend.colors.forEach((color, i) => {
      const row = element("div", "row");
      const swatch = element("span", "swatch");
      swatch.style.background = color;
      row.append(swatch, element("span", "", legend.labels[i]));
      box.append(row);
    });
  }
}

/**
 * A gauge's display name, from its EF5 name.
 * @param {string} name e.g. cuenca_villalobos_out
 * @returns {string}
 */
export function gaugeLabel(name) {
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Let a gauge marker take keyboard focus and open on Enter or Space.
 * @param {SVGElement} element the marker's path
 * @param {{name: string}} gauge
 * @param {() => void} open
 */
function focusable(element, gauge, open) {
  element.setAttribute("tabindex", "0");
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `Hydrograph for ${gaugeLabel(gauge.name)}`);
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
  });
}
