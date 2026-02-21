import { describe, it, expect } from "vitest";
import { generateCanvas } from "../generate/canvas/canvas-generator.js";
import type { IRBoard, IRStickyNote, IRShape, IRFrame, IRImage, IRCard, IREmbed, IRText, IREdge, IRDocument, IRPreview } from "../model/types.js";

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

describe("generateCanvas", () => {
  it("generates valid JSON with nodes and edges arrays", () => {
    const result = JSON.parse(generateCanvas(makeBoard()));
    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it("converts sticky notes to text nodes", () => {
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

    const result = JSON.parse(generateCanvas(makeBoard([sticky])));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      type: "text",
      text: "Hello world",
      x: 100,
      y: 200,
      width: 199,
      height: 228,
      color: "3", // yellow preset
    });
  });

  it("converts shapes to text nodes", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 168,
      height: 120,
      rotation: 0,
      shapeType: "flow_chart_process",
      content: "Process Step",
      color: { hex: "#ffffff" },
    };

    const result = JSON.parse(generateCanvas(makeBoard([shape])));
    expect(result.nodes[0]).toMatchObject({
      type: "text",
      text: "Process Step",
    });
  });

  it("shows shape type when shape has no content", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      shapeType: "circle",
      content: "",
    };

    const result = JSON.parse(generateCanvas(makeBoard([shape])));
    expect(result.nodes[0].text).toBe("[circle]");
  });

  it("converts frames to group nodes", () => {
    const frame: IRFrame = {
      id: "3",
      type: "frame",
      x: 0,
      y: 0,
      width: 600,
      height: 400,
      rotation: 0,
      label: "Planning Section",
      childIds: ["1"],
    };

    const result = JSON.parse(generateCanvas(makeBoard([frame])));
    expect(result.nodes[0]).toMatchObject({
      type: "group",
      label: "Planning Section",
      width: 600,
      height: 400,
    });
  });

  it("converts images with local path to file nodes", () => {
    const image: IRImage = {
      id: "4",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      assetId: "img_4",
      title: "Architecture",
    };

    const board = makeBoard([image], [], [
      { id: "img_4", miroUrl: "https://miro.example.com/img.png", localPath: "assets/img_4.png" },
    ]);
    const result = JSON.parse(generateCanvas(board));
    expect(result.nodes[0]).toMatchObject({
      type: "file",
      file: "assets/img_4.png",
    });
  });

  it("converts images without local path to link nodes", () => {
    const image: IRImage = {
      id: "4",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      assetId: "img_4",
    };

    const board = makeBoard([image], [], [
      { id: "img_4", miroUrl: "https://miro.example.com/img.png" },
    ]);
    const result = JSON.parse(generateCanvas(board));
    expect(result.nodes[0]).toMatchObject({
      type: "link",
      url: "https://miro.example.com/img.png",
    });
  });

  it("converts cards to text nodes with title and description", () => {
    const card: IRCard = {
      id: "5",
      type: "card",
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      rotation: 0,
      title: "Task Name",
      description: "Do the thing",
    };

    const result = JSON.parse(generateCanvas(makeBoard([card])));
    expect(result.nodes[0].text).toBe("**Task Name**\n\nDo the thing");
  });

  it("converts embeds to link nodes", () => {
    const embed: IREmbed = {
      id: "6",
      type: "embed",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      url: "https://example.com/embed",
    };

    const result = JSON.parse(generateCanvas(makeBoard([embed])));
    expect(result.nodes[0]).toMatchObject({
      type: "link",
      url: "https://example.com/embed",
    });
  });

  it("converts connectors to edges", () => {
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

    const result = JSON.parse(generateCanvas(makeBoard([sticky1, sticky2], [edge])));
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      fromEnd: "none",
      toEnd: "arrow",
      label: "leads to",
      color: "#000000",
    });
    // fromNode and toNode should be valid mapped IDs
    expect(result.edges[0].fromNode).toBe(result.nodes[0].id);
    expect(result.edges[0].toNode).toBe(result.nodes[1].id);
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

    const result = JSON.parse(generateCanvas(makeBoard([sticky], [edge])));
    expect(result.edges).toHaveLength(0);
  });

  it("places groups before content nodes (z-order)", () => {
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

    const result = JSON.parse(generateCanvas(makeBoard([sticky, frame])));
    expect(result.nodes[0].type).toBe("group");
    expect(result.nodes[1].type).toBe("text");
  });

  it("rounds coordinates to integers", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 100.7,
      y: 200.3,
      width: 199.5,
      height: 228.9,
      rotation: 0,
      content: "test",
    };

    const result = JSON.parse(generateCanvas(makeBoard([sticky])));
    expect(result.nodes[0].x).toBe(101);
    expect(result.nodes[0].y).toBe(200);
    expect(result.nodes[0].width).toBe(200);
    expect(result.nodes[0].height).toBe(229);
  });

  it("converts documents to text nodes (no local path)", () => {
    const doc: IRDocument = {
      id: "7",
      type: "document",
      x: 0,
      y: 0,
      width: 200,
      height: 300,
      rotation: 0,
      title: "introduction-to-okrs.pdf",
      documentUrl: "https://api.miro.com/v2/boards/xxx/resources/documents/123",
    };

    const result = JSON.parse(generateCanvas(makeBoard([doc])));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      type: "text",
      text: "📄 introduction-to-okrs.pdf",
    });
  });

  it("converts documents with local path to file nodes", () => {
    const doc: IRDocument = {
      id: "7",
      type: "document",
      x: 0,
      y: 0,
      width: 200,
      height: 300,
      rotation: 0,
      title: "standups.pdf",
      documentUrl: "https://api.miro.com/...",
    };

    const board = makeBoard([doc], [], [
      { id: "doc_7", miroUrl: "https://api.miro.com/...", localPath: "assets/doc_7.pdf" },
    ]);
    const result = JSON.parse(generateCanvas(board));
    expect(result.nodes[0]).toMatchObject({
      type: "file",
      file: "assets/doc_7.pdf",
    });
  });

  it("converts previews with URL to link nodes", () => {
    const preview: IRPreview = {
      id: "8",
      type: "preview",
      x: 100,
      y: 200,
      width: 250,
      height: 346,
      rotation: 0,
      url: "https://example.com/article",
      title: "Great Article",
    };

    const result = JSON.parse(generateCanvas(makeBoard([preview])));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      type: "link",
      url: "https://example.com/article",
    });
  });

  it("converts previews without URL to text nodes", () => {
    const preview: IRPreview = {
      id: "8",
      type: "preview",
      x: 0,
      y: 0,
      width: 250,
      height: 346,
      rotation: 0,
      url: "",
      title: "Some Preview",
    };

    const result = JSON.parse(generateCanvas(makeBoard([preview])));
    expect(result.nodes[0]).toMatchObject({
      type: "text",
      text: "🔗 Some Preview",
    });
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

    const result = JSON.parse(generateCanvas(board));
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(1);

    // Verify structure is valid
    const nodeIds = new Set(result.nodes.map((n: any) => n.id));
    for (const edge of result.edges) {
      expect(nodeIds.has(edge.fromNode)).toBe(true);
      expect(nodeIds.has(edge.toNode)).toBe(true);
    }
  });
});
