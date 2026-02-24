import type { IRColor } from "../../model/types.js";

// Miro named colors → draw.io fill/stroke hex pairs
const MIRO_TO_DRAWIO: Record<string, { fill: string; stroke: string }> = {
  light_yellow: { fill: "#fff2cc", stroke: "#d6b656" },
  yellow:       { fill: "#ffff88", stroke: "#36393d" },
  orange:       { fill: "#f0a30a", stroke: "#bd7000" },
  light_green:  { fill: "#d5e8d4", stroke: "#82b366" },
  green:        { fill: "#67ab9f", stroke: "#23877b" },
  dark_green:   { fill: "#006eaf", stroke: "#005885" },
  light_pink:   { fill: "#ffe6cc", stroke: "#d79b00" },
  pink:         { fill: "#f8cecc", stroke: "#b85450" },
  red:          { fill: "#f8cecc", stroke: "#b85450" },
  violet:       { fill: "#e1d5e7", stroke: "#9673a6" },
  light_blue:   { fill: "#dae8fc", stroke: "#6c8ebf" },
  blue:         { fill: "#0050ef", stroke: "#001dbc" },
  dark_blue:    { fill: "#023e8a", stroke: "#012a5c" },
  gray:         { fill: "#f5f5f5", stroke: "#666666" },
  black:        { fill: "#000000", stroke: "#ffffff" },
};

/**
 * Map an IRColor to a draw.io fill hex color.
 * Returns a hex string (e.g. "#fff2cc").
 */
export function irColorToDrawioFill(color: IRColor | undefined): string {
  if (!color) return "#ffffff";
  if (color.miroName) {
    const entry = MIRO_TO_DRAWIO[color.miroName];
    if (entry) return entry.fill;
  }
  return color.hex || "#ffffff";
}

/**
 * Map an IRColor to a draw.io stroke hex color.
 * Returns a hex string (e.g. "#d6b656").
 */
export function irColorToDrawioStroke(color: IRColor | undefined): string {
  if (!color) return "#000000";
  if (color.miroName) {
    const entry = MIRO_TO_DRAWIO[color.miroName];
    if (entry) return entry.stroke;
  }
  // Derive stroke by using the fill hex (darken ~30% via simple approximation)
  return darkenHex(color.hex || "#000000", 0.3);
}

/**
 * Darken a hex color by a given factor (0-1).
 */
function darkenHex(hex: string, factor: number): string {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return "#000000";
  const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - factor)));
  const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - factor)));
  const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - factor)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
