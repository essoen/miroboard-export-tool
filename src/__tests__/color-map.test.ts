import { describe, it, expect } from "vitest";
import { parseMiroColor, irColorToCanvasColor } from "../model/color-map.js";

describe("parseMiroColor", () => {
  it("parses named Miro colors", () => {
    const result = parseMiroColor("light_yellow");
    expect(result).toEqual({ hex: "#fff9b1", miroName: "light_yellow" });
  });

  it("parses red", () => {
    const result = parseMiroColor("red");
    expect(result).toEqual({ hex: "#e6393f", miroName: "red" });
  });

  it("passes through hex colors", () => {
    const result = parseMiroColor("#4fc1e8");
    expect(result).toEqual({ hex: "#4fc1e8" });
  });

  it("returns undefined for undefined input", () => {
    expect(parseMiroColor(undefined)).toBeUndefined();
  });

  it("handles unknown color strings", () => {
    const result = parseMiroColor("custom_color");
    expect(result).toEqual({ hex: "custom_color" });
  });

  it("parses all known Miro colors", () => {
    const knownColors = [
      "gray",
      "light_yellow",
      "yellow",
      "orange",
      "light_green",
      "green",
      "dark_green",
      "cyan",
      "light_blue",
      "blue",
      "dark_blue",
      "light_pink",
      "pink",
      "red",
      "violet",
      "black",
    ];
    for (const name of knownColors) {
      const result = parseMiroColor(name);
      expect(result).toBeDefined();
      expect(result!.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(result!.miroName).toBe(name);
    }
  });
});

describe("irColorToCanvasColor", () => {
  it("maps yellow family to preset 3", () => {
    expect(irColorToCanvasColor({ hex: "#fff9b1", miroName: "light_yellow" })).toBe("3");
    expect(irColorToCanvasColor({ hex: "#f5d128", miroName: "yellow" })).toBe("3");
  });

  it("maps orange to preset 2", () => {
    expect(irColorToCanvasColor({ hex: "#ff9d48", miroName: "orange" })).toBe("2");
  });

  it("maps green family to preset 4", () => {
    expect(irColorToCanvasColor({ hex: "#d5f692", miroName: "light_green" })).toBe("4");
    expect(irColorToCanvasColor({ hex: "#67c6c0", miroName: "green" })).toBe("4");
    expect(irColorToCanvasColor({ hex: "#1aaa55", miroName: "dark_green" })).toBe("4");
  });

  it("maps blue family to preset 5", () => {
    expect(irColorToCanvasColor({ hex: "#93d4f1", miroName: "light_blue" })).toBe("5");
    expect(irColorToCanvasColor({ hex: "#4fc1e8", miroName: "blue" })).toBe("5");
    expect(irColorToCanvasColor({ hex: "#2d9bf0", miroName: "dark_blue" })).toBe("5");
    expect(irColorToCanvasColor({ hex: "#67c6c0", miroName: "cyan" })).toBe("5");
  });

  it("maps pink/red to preset 1", () => {
    expect(irColorToCanvasColor({ hex: "#f16c7f", miroName: "pink" })).toBe("1");
    expect(irColorToCanvasColor({ hex: "#e6393f", miroName: "red" })).toBe("1");
  });

  it("maps purple family to preset 6", () => {
    expect(irColorToCanvasColor({ hex: "#ea94bb", miroName: "light_pink" })).toBe("6");
    expect(irColorToCanvasColor({ hex: "#b384bb", miroName: "violet" })).toBe("6");
  });

  it("falls back to hex for colors without preset mapping", () => {
    expect(irColorToCanvasColor({ hex: "#e6e6e6", miroName: "gray" })).toBe("#e6e6e6");
    expect(irColorToCanvasColor({ hex: "#1a1a1a", miroName: "black" })).toBe("#1a1a1a");
  });

  it("uses hex for colors without miroName", () => {
    expect(irColorToCanvasColor({ hex: "#ff0000" })).toBe("#ff0000");
  });

  it("returns undefined for undefined input", () => {
    expect(irColorToCanvasColor(undefined)).toBeUndefined();
  });
});
