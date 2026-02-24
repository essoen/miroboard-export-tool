import { describe, it, expect } from "vitest";
import { generateDrawio } from "../generate/drawio/drawio-generator.js";
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

describe("generateDrawio", () => {
  it("produces valid XML with mxfile, diagram, and mxGraphModel", () => {
    const xml = generateDrawio(makeBoard());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<mxfile>");
    expect(xml).toContain("</mxfile>");
    expect(xml).toContain("<diagram");
    expect(xml).toContain("<mxGraphModel>");
    expect(xml).toContain("<root>");
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
  });

  it("includes board name in diagram tag", () => {
    const board = makeBoard();
    board.name = "My Board";
    const xml = generateDrawio(board);
    expect(xml).toContain('name="My Board"');
  });

  it("converts sticky notes to rounded mxCell vertices", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 100,
      y: 200,
      width: 199,
      height: 228,
      rotation: 0,
      content: "Hello world",
      color: { hex: "#fff2cc", miroName: "light_yellow" },
    };

    const xml = generateDrawio(makeBoard([sticky]));
    expect(xml).toContain('value="Hello world"');
    expect(xml).toContain("rounded=1");
    expect(xml).toContain("fillColor=#fff2cc");
    expect(xml).toContain('vertex="1"');
    expect(xml).toContain('x="100"');
    expect(xml).toContain('y="200"');
    expect(xml).toContain('width="199"');
    expect(xml).toContain('height="228"');
  });

  it("converts shapes with correct style prefix", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      rotation: 0,
      shapeType: "circle",
      content: "Step",
    };

    const xml = generateDrawio(makeBoard([shape]));
    expect(xml).toContain("ellipse");
    expect(xml).toContain('value="Step"');
  });

  it("maps rectangle shapeType to rounded=0", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      rotation: 0,
      shapeType: "rectangle",
      content: "",
    };

    const xml = generateDrawio(makeBoard([shape]));
    expect(xml).toContain("rounded=0");
  });

  it("maps diamond shapeType to rhombus", () => {
    const shape: IRShape = {
      id: "2",
      type: "shape",
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      rotation: 0,
      shapeType: "diamond",
      content: "",
    };

    const xml = generateDrawio(makeBoard([shape]));
    expect(xml).toContain("rhombus");
  });

  it("converts text nodes to text mxCells", () => {
    const text: IRText = {
      id: "3",
      type: "text",
      x: 10,
      y: 20,
      width: 300,
      height: 50,
      rotation: 0,
      content: "A title",
    };

    const xml = generateDrawio(makeBoard([text]));
    expect(xml).toContain('value="A title"');
    expect(xml).toContain("text;html=0;whiteSpace=wrap;");
  });

  it("converts frames to swimlane mxCells", () => {
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

    const xml = generateDrawio(makeBoard([frame]));
    expect(xml).toContain("swimlane");
    expect(xml).toContain('value="Planning Section"');
    expect(xml).toContain('width="600"');
    expect(xml).toContain('height="400"');
  });

  it("places frames before other nodes", () => {
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

    const xml = generateDrawio(makeBoard([sticky, frame]));
    // swimlane (frame) should appear before "rounded=1;whiteSpace=wrap" (sticky)
    const swimlanePos = xml.indexOf("swimlane");
    const stickyPos = xml.indexOf("rounded=1;whiteSpace=wrap");
    expect(swimlanePos).toBeLessThan(stickyPos);
  });

  it("gives frame children relative coords and correct parent", () => {
    const frame: IRFrame = {
      id: "10",
      type: "frame",
      x: 100,
      y: 200,
      width: 600,
      height: 400,
      rotation: 0,
      label: "Frame",
      childIds: ["11"],
    };
    const child: IRStickyNote = {
      id: "11",
      type: "sticky_note",
      x: 150,
      y: 250,
      width: 100,
      height: 100,
      rotation: 0,
      content: "Child",
      parentId: "10",
    };

    const xml = generateDrawio(makeBoard([frame, child]));
    // Child's relative coords should be 150-100=50, 250-200=50
    expect(xml).toContain('x="50"');
    expect(xml).toContain('y="50"');
    // Child parent attribute should reference the frame's cell ID
    // The frame ID maps to n + idMap.get("10")
    // We can check that there's a parent referencing a non-"1" id
    const childMatch = xml.match(/value="Child"[^>]*>[\s\S]*?<mxGeometry[^>]*/);
    // Check the parent is set (not "1")
    const childCellMatch = xml.match(/<mxCell[^>]*value="Child"[^>]*/);
    expect(childCellMatch).toBeTruthy();
    expect(childCellMatch![0]).not.toContain('parent="1"');
  });

  it("converts images with asset URL", () => {
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

    const board = makeBoard([image], [], [
      { id: "img_5", miroUrl: "https://miro.example.com/img.png" },
    ]);
    const xml = generateDrawio(board);
    expect(xml).toContain("shape=image");
    expect(xml).toContain("https://miro.example.com/img.png");
  });

  it("converts images with local path using file:// URL", () => {
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

    const board = makeBoard([image], [], [
      { id: "img_5", miroUrl: "https://miro.example.com/img.png", localPath: "/tmp/img_5.png" },
    ]);
    const xml = generateDrawio(board);
    expect(xml).toContain("shape=image");
    expect(xml).toContain("file:///tmp/img_5.png");
  });

  it("converts images with no asset to placeholder", () => {
    const image: IRImage = {
      id: "5",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      assetId: "img_5",
      title: "My Image",
    };

    const xml = generateDrawio(makeBoard([image]));
    expect(xml).toContain('value="My Image"');
    expect(xml).toContain("rounded=1");
  });

  it("converts cards with title and description", () => {
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

    const xml = generateDrawio(makeBoard([card]));
    expect(xml).toContain("Task Name");
    expect(xml).toContain("Do the thing");
    expect(xml).toContain("fillColor=#d5e8d4");
  });

  it("converts embeds with title and url", () => {
    const embed: IREmbed = {
      id: "7",
      type: "embed",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      url: "https://example.com/video",
      title: "My Video",
    };

    const xml = generateDrawio(makeBoard([embed]));
    expect(xml).toContain("https://example.com/video");
    expect(xml).toContain("My Video");
  });

  it("converts documents with 📄 prefix", () => {
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

    const xml = generateDrawio(makeBoard([doc]));
    expect(xml).toContain("📄 report.pdf");
  });

  it("converts previews with url", () => {
    const preview: IRPreview = {
      id: "9",
      type: "preview",
      x: 0,
      y: 0,
      width: 250,
      height: 346,
      rotation: 0,
      url: "https://example.com/article",
      title: "Great Article",
    };

    const xml = generateDrawio(makeBoard([preview]));
    expect(xml).toContain("https://example.com/article");
    expect(xml).toContain("Great Article");
  });

  it("converts connectors to edge mxCells with correct source/target", () => {
    const s1: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0, y: 0, width: 100, height: 100, rotation: 0,
      content: "A",
    };
    const s2: IRStickyNote = {
      id: "2",
      type: "sticky_note",
      x: 300, y: 0, width: 100, height: 100, rotation: 0,
      content: "B",
    };
    const edge: IREdge = {
      id: "e1",
      fromNodeId: "1",
      toNodeId: "2",
      label: "leads to",
      lineStyle: "straight",
      startCap: "none",
      endCap: "arrow",
    };

    const xml = generateDrawio(makeBoard([s1, s2], [edge]));
    expect(xml).toContain('edge="1"');
    expect(xml).toContain('value="leads to"');
    expect(xml).toContain("edgeStyle=none");
    expect(xml).toContain("startArrow=none");
    expect(xml).toContain("endArrow=block");
  });

  it("skips edges with missing endpoints", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0, y: 0, width: 100, height: 100, rotation: 0,
      content: "A",
    };
    const edge: IREdge = {
      id: "e1",
      fromNodeId: "1",
      toNodeId: "999", // missing
      lineStyle: "straight",
      startCap: "none",
      endCap: "arrow",
    };

    const xml = generateDrawio(makeBoard([sticky], [edge]));
    expect(xml).not.toContain('edge="1"');
  });

  it("applies curved edge style for curved lineStyle", () => {
    const s1: IRStickyNote = { id: "1", type: "sticky_note", x: 0, y: 0, width: 100, height: 100, rotation: 0, content: "A" };
    const s2: IRStickyNote = { id: "2", type: "sticky_note", x: 300, y: 0, width: 100, height: 100, rotation: 0, content: "B" };
    const edge: IREdge = {
      id: "e1", fromNodeId: "1", toNodeId: "2",
      lineStyle: "curved", startCap: "none", endCap: "none",
    };

    const xml = generateDrawio(makeBoard([s1, s2], [edge]));
    expect(xml).toContain("edgeStyle=elbowEdgeStyle;curved=1");
  });

  it("applies orthogonal edge style for elbowed lineStyle", () => {
    const s1: IRStickyNote = { id: "1", type: "sticky_note", x: 0, y: 0, width: 100, height: 100, rotation: 0, content: "A" };
    const s2: IRStickyNote = { id: "2", type: "sticky_note", x: 300, y: 0, width: 100, height: 100, rotation: 0, content: "B" };
    const edge: IREdge = {
      id: "e1", fromNodeId: "1", toNodeId: "2",
      lineStyle: "elbowed", startCap: "none", endCap: "none",
    };

    const xml = generateDrawio(makeBoard([s1, s2], [edge]));
    expect(xml).toContain("edgeStyle=orthogonalEdgeStyle");
  });

  it("applies diamond arrowhead for diamond endCap", () => {
    const s1: IRStickyNote = { id: "1", type: "sticky_note", x: 0, y: 0, width: 100, height: 100, rotation: 0, content: "A" };
    const s2: IRStickyNote = { id: "2", type: "sticky_note", x: 300, y: 0, width: 100, height: 100, rotation: 0, content: "B" };
    const edge: IREdge = {
      id: "e1", fromNodeId: "1", toNodeId: "2",
      lineStyle: "straight", startCap: "none", endCap: "diamond",
    };

    const xml = generateDrawio(makeBoard([s1, s2], [edge]));
    expect(xml).toContain("endArrow=diamond");
  });

  it("applies edge stroke color when specified", () => {
    const s1: IRStickyNote = { id: "1", type: "sticky_note", x: 0, y: 0, width: 100, height: 100, rotation: 0, content: "A" };
    const s2: IRStickyNote = { id: "2", type: "sticky_note", x: 300, y: 0, width: 100, height: 100, rotation: 0, content: "B" };
    const edge: IREdge = {
      id: "e1", fromNodeId: "1", toNodeId: "2",
      lineStyle: "straight", startCap: "none", endCap: "none",
      color: "#ff0000",
    };

    const xml = generateDrawio(makeBoard([s1, s2], [edge]));
    expect(xml).toContain("strokeColor=#ff0000");
  });

  it("escapes XML special characters in content", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0, y: 0, width: 100, height: 100, rotation: 0,
      content: 'Hello <world> & "friends"',
    };

    const xml = generateDrawio(makeBoard([sticky]));
    expect(xml).toContain("Hello &lt;world&gt; &amp; &quot;friends&quot;");
  });

  it("escapes & in board name", () => {
    const board = makeBoard();
    board.name = "A & B";
    const xml = generateDrawio(board);
    expect(xml).toContain('name="A &amp; B"');
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

    const xml = generateDrawio(makeBoard([sticky]));
    expect(xml).toContain('x="101"');
    expect(xml).toContain('y="200"');
    expect(xml).toContain('width="200"');
    expect(xml).toContain('height="229"');
  });

  it("IRColor hex appears in node style", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0, y: 0, width: 100, height: 100, rotation: 0,
      content: "Colored",
      color: { hex: "#aabbcc" },
    };

    const xml = generateDrawio(makeBoard([sticky]));
    expect(xml).toContain("fillColor=#aabbcc");
  });

  it("handles an empty board with no nodes or edges", () => {
    const xml = generateDrawio(makeBoard());
    expect(xml).toContain("<mxfile>");
    expect(xml).toContain("</mxfile>");
    // Should not throw and should have valid structure
    expect(xml).toContain('<mxCell id="0"/>');
    expect(xml).toContain('<mxCell id="1" parent="0"/>');
  });

  it("handles full board with mixed content", () => {
    const board = makeBoard(
      [
        {
          id: "1",
          type: "sticky_note",
          x: 100, y: 100, width: 200, height: 200, rotation: 0,
          content: "Note 1",
          color: { hex: "#f8cecc", miroName: "red" },
        } as IRStickyNote,
        {
          id: "2",
          type: "frame",
          x: 0, y: 0, width: 800, height: 600, rotation: 0,
          label: "Main Frame",
          childIds: ["1"],
        } as IRFrame,
        {
          id: "3",
          type: "text",
          x: 400, y: 100, width: 300, height: 50, rotation: 0,
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

    const xml = generateDrawio(board);
    expect(xml).toContain("swimlane");
    expect(xml).toContain('value="Note 1"');
    expect(xml).toContain('value="Title"');
    expect(xml).toContain('edge="1"');
  });
});
