import type { IRColor } from "./types.js";

// Miro sticky note named colors → hex values
const MIRO_COLOR_HEX: Record<string, string> = {
  gray: "#e6e6e6",
  light_yellow: "#fff9b1",
  yellow: "#f5d128",
  orange: "#ff9d48",
  light_green: "#d5f692",
  green: "#67c6c0",
  dark_green: "#1aaa55",
  cyan: "#67c6c0",
  light_blue: "#93d4f1",
  blue: "#4fc1e8",
  dark_blue: "#2d9bf0",
  light_pink: "#ea94bb",
  pink: "#f16c7f",
  red: "#e6393f",
  violet: "#b384bb",
  black: "#1a1a1a",
};

// Miro named colors → JSON Canvas preset colors
// Canvas presets: "1" (red), "2" (orange), "3" (yellow), "4" (green), "5" (cyan), "6" (purple)
const MIRO_TO_CANVAS_PRESET: Record<string, string> = {
  light_yellow: "3",
  yellow: "3",
  orange: "2",
  light_green: "4",
  green: "4",
  dark_green: "4",
  cyan: "5",
  light_blue: "5",
  blue: "5",
  dark_blue: "5",
  light_pink: "6",
  pink: "1",
  red: "1",
  violet: "6",
  // gray and black → no preset, use hex
};

/**
 * Parse a Miro color value (named color or hex) into an IRColor.
 */
export function parseMiroColor(
  miroColor: string | undefined,
): IRColor | undefined {
  if (!miroColor) return undefined;

  // If it's a named Miro color
  const hex = MIRO_COLOR_HEX[miroColor];
  if (hex) {
    return { hex, miroName: miroColor };
  }

  // If it's already a hex value (shapes use hex directly)
  if (miroColor.startsWith("#")) {
    return { hex: miroColor };
  }

  // Unknown color format - pass through as hex
  return { hex: miroColor };
}

/**
 * Map an IRColor to a JSON Canvas color value.
 * Returns a preset string ("1"-"6") if possible, otherwise returns hex.
 */
export function irColorToCanvasColor(
  color: IRColor | undefined,
): string | undefined {
  if (!color) return undefined;

  // Try to map via Miro name first
  if (color.miroName) {
    const preset = MIRO_TO_CANVAS_PRESET[color.miroName];
    if (preset) return preset;
  }

  // Fall back to hex
  return color.hex;
}
