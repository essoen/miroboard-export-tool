import type { IRColor } from "../../model/types.js";

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
