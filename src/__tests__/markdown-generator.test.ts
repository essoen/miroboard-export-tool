import { describe, it, expect } from "vitest";
import { generateMarkdown } from "../generate/markdown/markdown-generator.js";
import type {
  IRBoard,
  IRStickyNote,
  IRCard,
  IRText,
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

describe("generateMarkdown", () => {
  it("generates index file for empty board", () => {
    const result = generateMarkdown(makeBoard());
    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe("Test-Board-index.md");
    expect(result[0].content).toContain("# Test Board");
  });

  it("generates notes for sticky notes", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 199,
      height: 228,
      rotation: 0,
      content: "This is a sticky note",
      color: { hex: "#fff9b1", miroName: "light_yellow" },
    };

    const result = generateMarkdown(makeBoard([sticky]));
    // Should have sticky note + index
    expect(result).toHaveLength(2);

    const stickyFile = result.find((f) => !f.filename.includes("index"));
    expect(stickyFile).toBeDefined();
    expect(stickyFile!.content).toContain("This is a sticky note");
    expect(stickyFile!.content).toContain("miro_id: \"1\"");
    expect(stickyFile!.content).toContain("type: sticky_note");
  });

  it("generates notes for cards", () => {
    const card: IRCard = {
      id: "2",
      type: "card",
      x: 0,
      y: 0,
      width: 320,
      height: 200,
      rotation: 0,
      title: "My Card Title",
      description: "Card description here",
    };

    const result = generateMarkdown(makeBoard([card]));
    expect(result).toHaveLength(2);

    const cardFile = result.find((f) => !f.filename.includes("index"));
    expect(cardFile).toBeDefined();
    expect(cardFile!.content).toContain("# My Card Title");
    expect(cardFile!.content).toContain("Card description here");
  });

  it("generates notes for text nodes with substantial content", () => {
    const text: IRText = {
      id: "3",
      type: "text",
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      rotation: 0,
      content: "This is a text node with more than twenty characters",
    };

    const result = generateMarkdown(makeBoard([text]));
    expect(result).toHaveLength(2);

    const textFile = result.find((f) => !f.filename.includes("index"));
    expect(textFile).toBeDefined();
    expect(textFile!.content).toContain(
      "This is a text node with more than twenty characters",
    );
  });

  it("skips text nodes with short content", () => {
    const text: IRText = {
      id: "3",
      type: "text",
      x: 0,
      y: 0,
      width: 300,
      height: 100,
      rotation: 0,
      content: "Short text",
    };

    const result = generateMarkdown(makeBoard([text]));
    // Only index file
    expect(result).toHaveLength(1);
    expect(result[0].filename).toContain("index");
  });

  describe("document handling", () => {
    it("generates note with PDF embed when asset is downloaded", () => {
      const doc: IRDocument = {
        id: "7",
        type: "document",
        x: 0,
        y: 0,
        width: 200,
        height: 300,
        rotation: 0,
        title: "My Document",
        documentUrl: "https://api.miro.com/v2/boards/xxx/resources/documents/123",
      };

      const board = makeBoard(
        [doc],
        [],
        [
          {
            id: "doc_7",
            miroUrl: "https://api.miro.com/...",
            localPath: "assets/doc_7.pdf",
          },
        ],
      );

      const result = generateMarkdown(board);
      expect(result).toHaveLength(2);

      const docFile = result.find((f) => !f.filename.includes("index"));
      expect(docFile).toBeDefined();
      expect(docFile!.content).toContain("# 📄 My Document");
      expect(docFile!.content).toContain("![[assets/doc_7.pdf]]");
    });

    it("excludes document when asset has no localPath", () => {
      const doc: IRDocument = {
        id: "7",
        type: "document",
        x: 0,
        y: 0,
        width: 200,
        height: 300,
        rotation: 0,
        title: "My Document",
        documentUrl: "https://api.miro.com/v2/boards/xxx/resources/documents/123",
      };

      // Asset exists but has no localPath (download failed or not attempted)
      const board = makeBoard(
        [doc],
        [],
        [{ id: "doc_7", miroUrl: "https://api.miro.com/..." }],
      );

      const result = generateMarkdown(board);
      // Only index file - no document note
      expect(result).toHaveLength(1);
      expect(result[0].filename).toContain("index");
    });

    it("excludes document when asset does not exist", () => {
      const doc: IRDocument = {
        id: "7",
        type: "document",
        x: 0,
        y: 0,
        width: 200,
        height: 300,
        rotation: 0,
        title: "My Document",
        documentUrl: "https://api.miro.com/v2/boards/xxx/resources/documents/123",
      };

      // No asset at all
      const board = makeBoard([doc], [], []);

      const result = generateMarkdown(board);
      // Only index file - no document note
      expect(result).toHaveLength(1);
      expect(result[0].filename).toContain("index");
    });
  });

  describe("preview handling", () => {
    it("generates note for preview with URL", () => {
      const preview: IRPreview = {
        id: "8",
        type: "preview",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        rotation: 0,
        url: "https://example.com/article",
        title: "Example Article",
      };

      const result = generateMarkdown(makeBoard([preview]));
      expect(result).toHaveLength(2);

      const previewFile = result.find((f) => !f.filename.includes("index"));
      expect(previewFile).toBeDefined();
      expect(previewFile!.content).toContain("# 🔗 Example Article");
      expect(previewFile!.content).toContain(
        "[Example Article](https://example.com/article)",
      );
    });

    it("skips preview with empty URL and no title", () => {
      const preview: IRPreview = {
        id: "8",
        type: "preview",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        rotation: 0,
        url: "", // Empty URL
      };

      const result = generateMarkdown(makeBoard([preview]));
      // Only index
      expect(result).toHaveLength(1);
    });
  });

  it("links to canvas file in index when provided", () => {
    const sticky: IRStickyNote = {
      id: "1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 199,
      height: 228,
      rotation: 0,
      content: "Test note content here",
    };

    const result = generateMarkdown(makeBoard([sticky]), "test-board.canvas");
    const index = result.find((f) => f.filename.includes("index"));
    expect(index).toBeDefined();
    expect(index!.content).toContain("[[test-board]] (Canvas)");
  });
});
