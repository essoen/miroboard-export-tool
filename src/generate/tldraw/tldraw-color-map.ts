import type { IRColor } from "../../model/types.js";

// tldraw named colors (from @tldraw/tlschema defaultColorNames)
// Available: black, grey, light-violet, violet, blue, light-blue,
//            yellow, orange, green, light-green, light-red, red, white
export type TldrawColor =
  | "black"
  | "grey"
  | "light-violet"
  | "violet"
  | "blue"
  | "light-blue"
  | "yellow"
  | "orange"
  | "green"
  | "light-green"
  | "light-red"
  | "red"
  | "white";

// Miro named colors → tldraw named colors
const MIRO_TO_TLDRAW: Record<string, TldrawColor> = {
  light_yellow: "yellow",
  yellow: "yellow",
  orange: "orange",
  light_green: "light-green",
  green: "green",
  dark_green: "green",
  cyan: "light-blue",
  light_blue: "light-blue",
  blue: "blue",
  dark_blue: "blue",
  light_pink: "light-red",
  pink: "red",
  red: "red",
  violet: "violet",
  gray: "grey",
  black: "black",
};

/**
 * Map an IRColor to a tldraw named color.
 * Returns one of tldraw's 13 named colors.
 */
export function irColorToTldrawColor(
  color: IRColor | undefined,
): TldrawColor {
  if (!color) return "black";

  if (color.miroName && MIRO_TO_TLDRAW[color.miroName]) {
    return MIRO_TO_TLDRAW[color.miroName];
  }

  // For arbitrary hex colors, default to black
  return "black";
}

/**
 * Map an IRColor to a tldraw note color.
 * tldraw notes use the same color names but the visual meaning differs
 * (note background vs stroke color). We use the same mapping.
 */
export function irColorToTldrawNoteColor(
  color: IRColor | undefined,
): TldrawColor {
  if (!color) return "yellow"; // Default note color in tldraw
  return irColorToTldrawColor(color);
}
