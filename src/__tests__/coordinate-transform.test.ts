import { describe, it, expect } from "vitest";
import {
  miroToTopLeft,
  normalizeToPositiveSpace,
} from "../model/coordinate-transform.js";
import type { IRNode, IRStickyNote, IRText } from "../model/types.js";

describe("miroToTopLeft", () => {
  it("converts center-origin to top-left corner", () => {
    const result = miroToTopLeft(
      { x: 0, y: 0 },
      { width: 200, height: 100 },
    );
    expect(result).toEqual({ x: -100, y: -50 });
  });

  it("handles positive center position", () => {
    const result = miroToTopLeft(
      { x: 500, y: 300 },
      { width: 200, height: 100 },
    );
    expect(result).toEqual({ x: 400, y: 250 });
  });

  it("handles negative center position", () => {
    const result = miroToTopLeft(
      { x: -200, y: -100 },
      { width: 199, height: 228 },
    );
    expect(result).toEqual({ x: -299.5, y: -214 });
  });

  it("handles zero-size item", () => {
    const result = miroToTopLeft({ x: 100, y: 50 }, { width: 0, height: 0 });
    expect(result).toEqual({ x: 100, y: 50 });
  });
});

describe("normalizeToPositiveSpace", () => {
  function makeNode(
    id: string,
    x: number,
    y: number,
    w: number = 100,
    h: number = 100,
  ): IRStickyNote {
    return {
      id,
      type: "sticky_note",
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      content: "test",
    };
  }

  it("shifts nodes so minimum is at margin", () => {
    const nodes: IRNode[] = [
      makeNode("a", -300, -200),
      makeNode("b", 100, 50),
    ];

    normalizeToPositiveSpace(nodes, 100);

    // min was (-300, -200), offset = (400, 300)
    expect(nodes[0].x).toBe(100); // -300 + 400
    expect(nodes[0].y).toBe(100); // -200 + 300
    expect(nodes[1].x).toBe(500); // 100 + 400
    expect(nodes[1].y).toBe(350); // 50 + 300
  });

  it("preserves relative distances between nodes", () => {
    const nodes: IRNode[] = [
      makeNode("a", -100, -50),
      makeNode("b", 200, 150),
    ];

    const dx = nodes[1].x - nodes[0].x;
    const dy = nodes[1].y - nodes[0].y;

    normalizeToPositiveSpace(nodes, 100);

    expect(nodes[1].x - nodes[0].x).toBe(dx);
    expect(nodes[1].y - nodes[0].y).toBe(dy);
  });

  it("handles empty array", () => {
    const nodes: IRNode[] = [];
    const result = normalizeToPositiveSpace(nodes);
    expect(result).toEqual([]);
  });

  it("handles single node", () => {
    const nodes: IRNode[] = [makeNode("a", -500, -1000)];
    normalizeToPositiveSpace(nodes, 50);
    expect(nodes[0].x).toBe(50);
    expect(nodes[0].y).toBe(50);
  });

  it("uses default margin of 100", () => {
    const nodes: IRNode[] = [makeNode("a", 0, 0)];
    normalizeToPositiveSpace(nodes);
    expect(nodes[0].x).toBe(100);
    expect(nodes[0].y).toBe(100);
  });

  it("handles nodes already in positive space", () => {
    const nodes: IRNode[] = [
      makeNode("a", 500, 500),
      makeNode("b", 800, 700),
    ];
    normalizeToPositiveSpace(nodes, 100);
    // min is (500, 500), offset = (-400, -400)
    expect(nodes[0].x).toBe(100);
    expect(nodes[0].y).toBe(100);
    expect(nodes[1].x).toBe(400);
    expect(nodes[1].y).toBe(300);
  });
});
