import { describe, it, expect } from "vitest";
import { generateTldraw } from "../generate/tldraw/tldraw-generator.js";
import { wrapTldrawForObsidian } from "../generate/tldraw/tldraw-obsidian-wrapper.js";
import type {
  IRBoard,
  IRStickyNote,
  IRShape,
  IRFrame,
  IRImage,
  IRCard,
  IREmbed,
  IRText,
  IREdge,
  IRDocument,
  IRPreview,
} from "../model/types.js";

function makeBoard(
  nodes: IRBoard["nodes"] = [],
  edges: IRBoard["edges"] = [],
  assets: IRBoard["assets"] = [],
): IRBoard {
  return {
    id: "test-board",
    name: "Test Board",
    sourceUrl: "https://miro.com/app/board/test/",
    extractedAt: "2024-01-01T00:00:00.000Z",
    nodes,
    edges,
    assets,
  };
}

function parseTldraw(board: IRBoard) {
  return JSON.parse(generateTldraw(board));
}

function getShapes(file: any) {
  return file.records.filter((r: any) => r.typeName === "shape");
}

function getBindings(file: any) {
  return file.records.filter((r: any) => r.typeName === "binding");
}

function getAssets(file: any) {
  return file.records.filter((r: any) => r.typeName === "asset");
}

describe("generateTldraw", () => {
  it("generates valid .tldr JSON structure", () => {
    const result = parseTldraw(makeBoard());
    expect(result.tldrawFileFormatVersion).toBe(1);
    expect(result.schema.schemaVersion).toBe(2);
    expect(result.schema.sequences).toBeDefined();
    expect(Array.isArray(result.records)).toBe(true);
  });

  it("includes document and page records", () => {
    const result = parseTldraw(makeBoard());
    const doc = result.records.find((r: any) => r.typeName === "document");
    const page = result.records.find((r: any) => r.typeName === "page");
    expect(doc).toMatchObject({
      id: "document:document",
      typeName: "document",
      name: "Test Board",
    });
    expect(page).toMatchObject({
      id: "page:page",
      typeName: "page",
      name: "Page 1",
    });
  });

  it("converts sticky notes to note shapes", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 100,
      y: 200,
      width: 199,
      height: 228,
      rotation: 0,
      content: "Hello world",
      color: { hex: "#fff9b1", miroName: "light_yellow" },
    };

    const result = parseTldraw(makeBoard([sticky]));
    const shapes = getShapes(result);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({
      typeName: "shape",
      type: "note",
      x: 100,
      y: 200,
    });
    expect(shapes[0].props.color).toBe("yellow");
    expect(shapes[0].props.text).toBe("Hello world");
  });

  it("converts shapes to geo shapes", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 168,
      height: 120,
      rotation: 0,
      shapeType: "circle",
      content: "Round",
      color: { hex: "#4262ff", miroName: "blue" },
    };

    const result = parseTldraw(makeBoard([shape]));
    const shapes = getShapes(result);
    expect(shapes[0]).toMatchObject({
      type: "geo",
    });
    expect(shapes[0].props.geo).toBe("ellipse");
    expect(shapes[0].props.w).toBe(168);
    expect(shapes[0].props.h).toBe(120);
    expect(shapes[0].props.color).toBe("blue");
  });

  it("maps Miro shape types to tldraw geo types", () => {
    const shapeTypes: [string, string][] = [
      ["rectangle", "rectangle"],
      ["circle", "ellipse"],
      ["triangle", "triangle"],
      ["rhombus", "diamond"],
      ["flow_chart_decision", "diamond"],
      ["cloud", "cloud"],
      ["star", "star"],
    ];

    for (const [miroType, expectedGeo] of shapeTypes) {
      const shape: IRShape = {
        id: `shape_${miroType}`,
        type: "shape",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        shapeType: miroType,
        content: "",
      };
      const result = parseTldraw(makeBoard([shape]));
      const shapes = getShapes(result);
      expect(shapes[0].props.geo).toBe(expectedGeo);
    }
  });

  it("defaults unknown shape types to rectangle", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      shapeType: "unknown_shape_xyz",
      content: "",
    };

    const result = parseTldraw(makeBoard([shape]));
    const shapes = getShapes(result);
    expect(shapes[0].props.geo).toBe("rectangle");
  });

  it("converts text nodes to text shapes", () => {
    const text: IRText = {
      id: "3",
      type: "text",
      x: 50,
      y: 60,
      width: 300,
      height: 50,
      rotation: 0,
      content: "Title text",
    };

    const result = parseTldraw(makeBoard([text]));
    const shapes = getShapes(result);
    expect(shapes[0]).toMatchObject({
      type: "text",
      x: 50,
      y: 60,
    });
    expect(shapes[0].props.w).toBe(300);
    expect(shapes[0].props.text).toBe("Title text");
  });

  it("converts frames to frame shapes", () => {
    const frame: IRFrame = {
      id: "4",
      type: "frame",
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      rotation: 0,
      label: "Planning Section",
      childIds: [],
    };

    const result = parseTldraw(makeBoard([frame]));
    const shapes = getShapes(result);
    expect(shapes[0]).toMatchObject({
      type: "frame",
    });
    expect(shapes[0].props.name).toBe("Planning Section");
    expect(shapes[0].props.w).toBe(600);
    expect(shapes[0].props.h).toBe(400);
  });

  it("converts images to image shapes with asset references", () => {
    const image: IRImage = {
      id: "5",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      assetId: "img_5",
      title: "Architecture",
    };

    const board = makeBoard(
      [image],
      [],
      [{ id: "img_5", miroUrl: "https://miro.example.com/img.png", localPath: "assets/img_5.png" }],
    );
    const result = parseTldraw(board);
    const shapes = getShapes(result);
    const assets = getAssets(result);

    expect(shapes[0]).toMatchObject({
      type: "image",
    });
    expect(shapes[0].props.assetId).toBe("asset:img_5");
    expect(shapes[0].props.w).toBe(400);
    expect(shapes[0].props.h).toBe(300);

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: "asset:img_5",
      typeName: "asset",
      type: "image",
    });
    // Default (useLocalAssets: false) uses Miro URL
    expect(assets[0].props.src).toBe("https://miro.example.com/img.png");
    expect(assets[0].props.mimeType).toBe("image/png");
  });

  it("uses local paths when useLocalAssets is true", () => {
    const image: IRImage = {
      id: "5",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      assetId: "img_5",
    };

    const board = makeBoard(
      [image],
      [],
      [{ id: "img_5", miroUrl: "https://miro.example.com/img.png", localPath: "assets/img_5.png" }],
    );
    const result = JSON.parse(generateTldraw(board, { useLocalAssets: true }));
    const assets = getAssets(result);
    expect(assets[0].props.src).toBe("assets/img_5.png");
  });

  it("skips PDF assets", () => {
    const image: IRImage = {
      id: "5",
      type: "image",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      assetId: "doc_5",
    };

    const board = makeBoard(
      [image],
      [],
      [{ id: "doc_5", miroUrl: "https://api.miro.com/doc.pdf", localPath: "assets/doc_5.pdf" }],
    );
    const result = parseTldraw(board);
    const assets = getAssets(result);
    expect(assets).toHaveLength(0);
  });

  it("detects mime types from file extensions", () => {
    const image: IRImage = {
      id: "5",
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      assetId: "img_jpg",
    };

    const board = makeBoard(
      [image],
      [],
      [{ id: "img_jpg", miroUrl: "https://example.com/img.jpg", localPath: "assets/img_jpg.jpg" }],
    );
    const result = parseTldraw(board);
    const assets = getAssets(result);
    expect(assets[0].props.mimeType).toBe("image/jpeg");
  });

  it("converts cards to note shapes with combined title and description", () => {
    const card: IRCard = {
      id: "6",
      type: "card",
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      rotation: 0,
      title: "Task Name",
      description: "Do the thing",
    };

    const result = parseTldraw(makeBoard([card]));
    const shapes = getShapes(result);
    expect(shapes[0].type).toBe("note");
    expect(shapes[0].props.text).toBe("Task Name\n\nDo the thing");
  });

  it("converts embeds to embed shapes", () => {
    const embed: IREmbed = {
      id: "7",
      type: "embed",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      url: "https://example.com/embed",
    };

    const result = parseTldraw(makeBoard([embed]));
    const shapes = getShapes(result);
    expect(shapes[0]).toMatchObject({
      type: "embed",
    });
    expect(shapes[0].props.url).toBe("https://example.com/embed");
  });

  it("converts documents to geo rectangles", () => {
    const doc: IRDocument = {
      id: "8",
      type: "document",
      x: 0,
      y: 0,
      width: 200,
      height: 300,
      rotation: 0,
      title: "report.pdf",
      documentUrl: "https://api.miro.com/...",
    };

    const result = parseTldraw(makeBoard([doc]));
    const shapes = getShapes(result);
    expect(shapes[0]).toMatchObject({
      type: "geo",
    });
    expect(shapes[0].props.geo).toBe("rectangle");
    expect(shapes[0].props.color).toBe("grey");
    expect(shapes[0].props.text).toContain("report.pdf");
  });

  it("converts previews to bookmark shapes", () => {
    const preview: IRPreview = {
      id: "9",
      type: "preview",
      x: 100,
      y: 200,
      width: 250,
      height: 346,
      rotation: 0,
      url: "https://example.com/article",
      title: "Great Article",
    };

    const result = parseTldraw(makeBoard([preview]));
    const shapes = getShapes(result);
    expect(shapes[0]).toMatchObject({
      type: "bookmark",
    });
    expect(shapes[0].props.url).toBe("https://example.com/article");
  });

  it("converts edges to arrows with inline binding terminals", () => {
    const sticky1: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      content: "A",
    };
    const sticky2: IRStickyNote = {
      id: "2",
      type: "sticky_note",
      x: 300,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      content: "B",
    };
    const edge: IREdge = {
      id: "e1",
      fromNodeId: "1",
      toNodeId: "2",
      label: "leads to",
      color: "#000000",
      lineStyle: "curved",
      startCap: "none",
      endCap: "arrow",
    };

    const result = parseTldraw(makeBoard([sticky1, sticky2], [edge]));
    const shapes = getShapes(result);

    // 2 notes + 1 arrow = 3 shapes
    const arrows = shapes.filter((s: any) => s.type === "arrow");
    expect(arrows).toHaveLength(1);
    expect(arrows[0].props.arrowheadStart).toBe("none");
    expect(arrows[0].props.arrowheadEnd).toBe("arrow");
    expect(arrows[0].props.text).toBe("leads to");

    // Inline binding terminals (not separate binding records)
    expect(arrows[0].props.start.type).toBe("binding");
    expect(arrows[0].props.end.type).toBe("binding");
    expect(getBindings(result)).toHaveLength(0);
  });

  it("skips edges with missing endpoints", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      content: "A",
    };
    const edge: IREdge = {
      id: "e1",
      fromNodeId: "1",
      toNodeId: "999", // doesn't exist
      lineStyle: "straight",
      startCap: "none",
      endCap: "arrow",
    };

    const result = parseTldraw(makeBoard([sticky], [edge]));
    const arrows = getShapes(result).filter((s: any) => s.type === "arrow");
    expect(arrows).toHaveLength(0);
  });

  it("uses frame-relative coordinates for children", () => {
    const frame: IRFrame = {
      id: "f1",
      type: "frame",
      x: 100,
      y: 200,
      width: 600,
      height: 400,
      rotation: 0,
      label: "Container",
      childIds: ["s1"],
    };
    const sticky: IRStickyNote = {
      id: "s1",
      type: "sticky_note",
      x: 150,
      y: 250,
      width: 100,
      height: 100,
      rotation: 0,
      content: "Inside",
      parentId: "f1",
    };

    const result = parseTldraw(makeBoard([frame, sticky]));
    const shapes = getShapes(result);
    const noteShape = shapes.find((s: any) => s.type === "note");

    // Should be relative to frame: 150-100=50, 250-200=50
    expect(noteShape.x).toBe(50);
    expect(noteShape.y).toBe(50);
  });

  it("converts rotation from degrees to radians", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 90,
      content: "Rotated",
    };

    const result = parseTldraw(makeBoard([sticky]));
    const shapes = getShapes(result);
    expect(shapes[0].rotation).toBeCloseTo(Math.PI / 2, 5);
  });

  it("rounds coordinates to integers", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 100.7,
      y: 200.3,
      width: 199,
      height: 228,
      rotation: 0,
      content: "test",
    };

    const result = parseTldraw(makeBoard([sticky]));
    const shapes = getShapes(result);
    expect(shapes[0].x).toBe(101);
    expect(shapes[0].y).toBe(200);
  });

  it("places frames before other shapes", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      rotation: 0,
      content: "Inside",
    };
    const frame: IRFrame = {
      id: "2",
      type: "frame",
      x: 0,
      y: 0,
      width: 500,
      height: 500,
      rotation: 0,
      label: "Container",
      childIds: ["1"],
    };

    // Note: nodes array has sticky first, then frame
    const result = parseTldraw(makeBoard([sticky, frame]));
    const shapes = getShapes(result);
    expect(shapes[0].type).toBe("frame");
    expect(shapes[1].type).toBe("note");
  });

  it("handles full board with mixed content", () => {
    const board = makeBoard(
      [
        {
          id: "1",
          type: "sticky_note",
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          rotation: 0,
          content: "Note 1",
          color: { hex: "#e6393f", miroName: "red" },
        } as IRStickyNote,
        {
          id: "2",
          type: "frame",
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          rotation: 0,
          label: "Main Frame",
          childIds: ["1"],
        } as IRFrame,
        {
          id: "3",
          type: "text",
          x: 400,
          y: 100,
          width: 300,
          height: 50,
          rotation: 0,
          content: "Title",
        } as IRText,
      ],
      [
        {
          id: "e1",
          fromNodeId: "1",
          toNodeId: "3",
          lineStyle: "straight",
          startCap: "none",
          endCap: "arrow",
        },
      ],
    );

    const result = parseTldraw(board);
    const shapes = getShapes(result);

    // 3 nodes + 1 arrow = 4 shapes
    expect(shapes).toHaveLength(4);
    // No separate binding records (inline terminals)
    expect(getBindings(result)).toHaveLength(0);

    // Verify all shape IDs are unique
    const ids = shapes.map((s: any) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("generates deterministic IDs across calls (reset per call)", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      content: "test",
    };

    // Call twice — IDs should be the same since state resets
    const result1 = parseTldraw(makeBoard([sticky]));
    const result2 = parseTldraw(makeBoard([sticky]));
    const shapes1 = getShapes(result1);
    const shapes2 = getShapes(result2);
    expect(shapes1[0].id).toBe(shapes2[0].id);
  });

  it("sets default note color to yellow", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      content: "no color",
    };

    const result = parseTldraw(makeBoard([sticky]));
    const shapes = getShapes(result);
    expect(shapes[0].props.color).toBe("yellow");
  });

  it("sets fill to solid when shape has color", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      shapeType: "rectangle",
      content: "",
      color: { hex: "#ff0000", miroName: "red" },
    };

    const result = parseTldraw(makeBoard([shape]));
    const shapes = getShapes(result);
    expect(shapes[0].props.fill).toBe("solid");
  });

  it("sets fill to none when shape has no color", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      shapeType: "rectangle",
      content: "",
    };

    const result = parseTldraw(makeBoard([shape]));
    const shapes = getShapes(result);
    expect(shapes[0].props.fill).toBe("none");
  });
});

describe("wrapTldrawForObsidian", () => {
  it("wraps .tldr JSON in Obsidian plugin format", () => {
    const tldrJson = JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] });
    const result = wrapTldrawForObsidian(tldrJson);

    expect(result).toContain("---\ntldraw-file: true\n---");
    expect(result).toContain("!!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!");
    expect(result).toContain("!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!");
    // Start delimiter on same line as code fence
    expect(result).toContain("```json !!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!");
  });

  it("includes meta block with plugin version and uuid", () => {
    const tldrJson = JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] });
    const result = wrapTldrawForObsidian(tldrJson);

    // Extract the JSON between delimiters
    const jsonMatch = result.match(/START_OF_TLDRAW_DATA[^!]*!!!\n([\s\S]*?)\n!!!_END/);
    expect(jsonMatch).toBeTruthy();

    const wrapper = JSON.parse(jsonMatch![1]);
    expect(wrapper.meta).toBeDefined();
    expect(wrapper.meta["plugin-version"]).toBe("1.27.0");
    expect(wrapper.meta["tldraw-version"]).toBe("3.15.3");
    expect(wrapper.meta.uuid).toBeDefined();
    expect(typeof wrapper.meta.uuid).toBe("string");
  });

  it("includes the raw tldraw data", () => {
    const data = { tldrawFileFormatVersion: 1, schema: { schemaVersion: 2 }, records: [{ id: "test" }] };
    const tldrJson = JSON.stringify(data);
    const result = wrapTldrawForObsidian(tldrJson);

    const jsonMatch = result.match(/START_OF_TLDRAW_DATA[^!]*!!!\n([\s\S]*?)\n!!!_END/);
    const wrapper = JSON.parse(jsonMatch![1]);
    expect(wrapper.raw).toEqual(data);
  });

  it("uses tab indentation for JSON", () => {
    const tldrJson = JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] });
    const result = wrapTldrawForObsidian(tldrJson);
    expect(result).toContain("\t\"meta\"");
  });
});
