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
