import type { IRBoard, IRNode, IREdge, IRAsset } from "../../model/types.js";
import { irColorToTldrawColor, irColorToTldrawNoteColor } from "./tldraw-color-map.js";

// --- tldraw record types (hand-crafted, no @tldraw/* dependency) ---

interface TldrawFile {
  tldrawFileFormatVersion: 1;
  schema: {
    schemaVersion: 2;
    sequences: Record<string, number>;
  };
  records: TldrawRecord[];
}

type TldrawRecord =
  | TldrawDocumentRecord
  | TldrawPageRecord
  | TldrawShapeRecord
  | TldrawAssetRecord;

interface TldrawDocumentRecord {
  id: "document:document";
  typeName: "document";
  name: string;
  meta: Record<string, unknown>;
}

interface TldrawPageRecord {
  id: "page:page";
  typeName: "page";
  name: string;
  index: string;
  meta: Record<string, unknown>;
}

interface TldrawShapeRecord {
  id: string;
  typeName: "shape";
  type: string;
  x: number;
  y: number;
  rotation: number;
  index: string;
  parentId: string;
  isLocked: boolean;
  opacity: number;
  props: Record<string, unknown>;
  meta: Record<string, unknown>;
}

interface TldrawAssetRecord {
  id: string;
  typeName: "asset";
  type: "image";
  props: {
    name: string;
    src: string;
    w: number;
    h: number;
    mimeType: string;
    isAnimated: boolean;
  };
  meta: Record<string, unknown>;
}

// --- ID generation ---

let idCounter = 0;

function nextId(): string {
  return (idCounter++).toString(16).padStart(12, "0");
}

function resetIds(): void {
  idCounter = 0;
}

// Track miroId → tldraw shape ID
const shapeIdMap = new Map<string, string>();

function getShapeId(miroId: string): string {
  let id = shapeIdMap.get(miroId);
  if (!id) {
    id = `shape:${nextId()}`;
    shapeIdMap.set(miroId, id);
  }
  return id;
}

// --- Index generation (tldraw uses fractional indexing) ---

function generateIndex(i: number): string {
  // Simple fractional index: a1, a2, a3, ...
  return `a${i + 1}`;
}

// --- Miro shape type → tldraw geo type ---

const MIRO_SHAPE_TO_GEO: Record<string, string> = {
  rectangle: "rectangle",
  round_rectangle: "rectangle",
  circle: "ellipse",
  triangle: "triangle",
  rhombus: "diamond",
  pentagon: "pentagon",
  hexagon: "hexagon",
  octagon: "octagon",
  star: "star",
  trapezoid: "trapezoid",
  flow_chart_process: "rectangle",
  flow_chart_decision: "diamond",
  flow_chart_terminator: "oval",
  flow_chart_predefined_process: "rectangle",
  flow_chart_data: "rectangle",
  flow_chart_document: "rectangle",
  cloud: "cloud",
  right_arrow: "arrow-right",
  left_arrow: "arrow-left",
  cross: "x-box",
  can: "oval",
  heart: "heart",
  wedge_round_rectangle_callout: "rectangle",
};

// --- Schema version ---
// Uses tldraw v2.1.4 baseline sequence numbers. The obsidian-plugin's
// bundled tldraw (3.15.x) will auto-migrate these to the current version.
// Using numbers higher than what the plugin supports causes parse failures.

const TLDRAW_SCHEMA = {
  schemaVersion: 2 as const,
  sequences: {
    "com.tldraw.store": 4,
    "com.tldraw.asset": 1,
    "com.tldraw.camera": 1,
    "com.tldraw.document": 2,
    "com.tldraw.instance": 24,
    "com.tldraw.instance_page_state": 5,
    "com.tldraw.page": 1,
    "com.tldraw.shape": 4,
    "com.tldraw.asset.bookmark": 1,
    "com.tldraw.asset.image": 3,
    "com.tldraw.asset.video": 3,
    "com.tldraw.shape.group": 0,
    "com.tldraw.shape.text": 1,
    "com.tldraw.shape.bookmark": 2,
    "com.tldraw.shape.draw": 1,
    "com.tldraw.shape.geo": 8,
    "com.tldraw.shape.note": 6,
    "com.tldraw.shape.line": 4,
    "com.tldraw.shape.frame": 0,
    "com.tldraw.shape.arrow": 3,
    "com.tldraw.shape.highlight": 0,
    "com.tldraw.shape.embed": 4,
    "com.tldraw.shape.image": 3,
    "com.tldraw.shape.video": 2,
    "com.tldraw.instance_presence": 5,
    "com.tldraw.pointer": 1,
  },
};

// --- Main generator ---

export interface TldrawOptions {
  /** Use local file paths for assets (for Obsidian). When false, uses Miro URLs (for tldraw.com). Default: false. */
  useLocalAssets?: boolean;
}

/**
 * Generate a .tldr file (tldraw JSON) from an IR board.
 */
export function generateTldraw(board: IRBoard, options: TldrawOptions = {}): string {
  const { useLocalAssets = false } = options;
  // Reset state for each generation
  resetIds();
  shapeIdMap.clear();

  const records: TldrawRecord[] = [];

  // Document and page records
  records.push({
    id: "document:document",
    typeName: "document",
    name: board.name,
    meta: {},
  });

  records.push({
    id: "page:page",
    typeName: "page",
    name: "Page 1",
    index: "a1",
    meta: {},
  });

  // Build node lookup for frame-relative coordinate conversion
  const nodeById = new Map(board.nodes.map((n) => [n.id, n]));

  // Pre-assign shape IDs for all nodes (needed for bindings)
  for (const node of board.nodes) {
    getShapeId(node.id);
  }

  // Convert nodes — frames first, then others
  const frames = board.nodes.filter((n) => n.type === "frame");
  const others = board.nodes.filter((n) => n.type !== "frame");
  let shapeIndex = 0;

  for (const node of [...frames, ...others]) {
    const shape = convertNode(node, shapeIndex, nodeById);
    if (shape) {
      records.push(shape);
      shapeIndex++;
    }
  }

  // Convert edges to arrows (with inline binding terminals)
  const nodeIds = new Set(board.nodes.map((n) => n.id));
  for (const edge of board.edges) {
    if (nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)) {
      const arrow = convertEdge(edge, shapeIndex, nodeById);
      records.push(arrow);
      shapeIndex++;
    }
  }

  // Asset records for images (skip PDFs — tldraw can't render them)
  const imageAssets = board.assets.filter((a) => {
    const ext = (a.localPath || a.miroUrl || "").split(".").pop()?.toLowerCase();
    return ext !== "pdf";
  });
  const assetRecords = convertAssets(imageAssets, board.nodes, useLocalAssets);
  records.push(...assetRecords);

  const file: TldrawFile = {
    tldrawFileFormatVersion: 1,
    schema: TLDRAW_SCHEMA,
    records,
  };

  return JSON.stringify(file, null, 2);
}

// --- Node conversion ---

function convertNode(
  node: IRNode,
  index: number,
  nodeById: Map<string, IRNode>,
): TldrawShapeRecord | null {
  const shapeId = getShapeId(node.id);

  // Determine parent: if node is inside a frame, set parentId to the frame's shape ID
  let parentId = "page:page";
  let x = node.x;
  let y = node.y;

  if (node.parentId) {
    const parent = nodeById.get(node.parentId);
    if (parent) {
      parentId = getShapeId(node.parentId);
      // Convert to frame-relative coordinates
      x = node.x - parent.x;
      y = node.y - parent.y;
    }
  }

  const base = {
    id: shapeId,
    typeName: "shape" as const,
    x: Math.round(x),
    y: Math.round(y),
    rotation: (node.rotation || 0) * (Math.PI / 180), // Degrees → radians
    index: generateIndex(index),
    parentId,
    isLocked: false,
    opacity: 1,
    meta: {},
  };

  switch (node.type) {
    case "sticky_note":
      return {
        ...base,
        type: "note",
        props: {
          color: irColorToTldrawNoteColor(node.color),
          size: "m",
          font: "sans",
          fontSizeAdjustment: 0,
          align: node.textAlign === "left" ? "start" : node.textAlign === "right" ? "end" : "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: node.content || "",
        },
      };

    case "shape": {
      const geo = MIRO_SHAPE_TO_GEO[node.shapeType] || "rectangle";
      return {
        ...base,
        type: "geo",
        props: {
          geo,
          w: Math.round(node.width),
          h: Math.round(node.height),
          color: irColorToTldrawColor(node.color),
          labelColor: "black",
          fill: node.color ? "solid" : "none",
          dash: "draw",
          size: "m",
          font: "sans",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: node.content || "",
        },
      };
    }

    case "text":
      return {
        ...base,
        type: "text",
        props: {
          color: irColorToTldrawColor(node.color),
          size: "m",
          font: "sans",
          align: "start",
          w: Math.round(node.width),
          text: node.content || "",
          scale: 1,
          autoSize: false,
        },
      };

    case "frame":
      return {
        ...base,
        type: "frame",
        props: {
          name: node.label || "",
          w: Math.round(node.width),
          h: Math.round(node.height),
        },
      };

    case "image": {
      const assetId = `asset:${node.assetId}`;
      return {
        ...base,
        type: "image",
        props: {
          assetId,
          w: Math.round(node.width),
          h: Math.round(node.height),
          playing: true,
          url: "",
          crop: null,
        },
      };
    }

    case "card": {
      // Cards become notes with title + description
      const cardText = node.description
        ? `${node.title}\n\n${node.description}`
        : node.title;
      return {
        ...base,
        type: "note",
        props: {
          color: irColorToTldrawNoteColor(node.color),
          size: "m",
          font: "sans",
          fontSizeAdjustment: 0,
          align: "start",
          verticalAlign: "start",
          growY: 0,
          url: "",
          text: cardText,
        },
      };
    }

    case "embed":
      return {
        ...base,
        type: "embed",
        props: {
          url: node.url || "",
          w: Math.round(node.width),
          h: Math.round(node.height),
        },
      };

    case "document": {
      // No PDF type in tldraw — use geo rectangle with title
      return {
        ...base,
        type: "geo",
        props: {
          geo: "rectangle",
          w: Math.round(node.width),
          h: Math.round(node.height),
          color: "grey",
          labelColor: "black",
          fill: "solid",
          dash: "draw",
          size: "m",
          font: "sans",
          align: "middle",
          verticalAlign: "middle",
          growY: 0,
          url: "",
          text: `📄 ${node.title}`,
        },
      };
    }

    case "preview":
      return {
        ...base,
        type: "bookmark",
        props: {
          url: node.url || "",
          w: Math.round(node.width),
          h: Math.round(node.height),
          assetId: null,
        },
      };

    default:
      return null;
  }
}

// --- Edge conversion ---

function convertEdge(
  edge: IREdge,
  index: number,
  nodeById: Map<string, IRNode>,
): TldrawShapeRecord {
  const arrowId = `shape:arrow_${nextId()}`;

  // Calculate arrow position as midpoint between connected nodes
  const fromNode = nodeById.get(edge.fromNodeId);
  const toNode = nodeById.get(edge.toNodeId);

  const fromCenterX = fromNode ? fromNode.x + fromNode.width / 2 : 0;
  const fromCenterY = fromNode ? fromNode.y + fromNode.height / 2 : 0;
  const toCenterX = toNode ? toNode.x + toNode.width / 2 : 0;
  const toCenterY = toNode ? toNode.y + toNode.height / 2 : 0;

  const fromShapeId = getShapeId(edge.fromNodeId);
  const toShapeId = getShapeId(edge.toNodeId);

  // Arrow x,y is the start point; start/end use inline binding terminals (v2.1.4 format)
  return {
    id: arrowId,
    typeName: "shape",
    type: "arrow",
    x: Math.round(fromCenterX),
    y: Math.round(fromCenterY),
    rotation: 0,
    index: generateIndex(index),
    parentId: "page:page",
    isLocked: false,
    opacity: 1,
    props: {
      color: edge.color ? irColorToTldrawColor({ hex: edge.color }) : "black",
      labelColor: "black",
      fill: "none",
      dash: "draw",
      size: "m",
      font: "sans",
      arrowheadStart: edge.startCap === "none" ? "none" : "arrow",
      arrowheadEnd: edge.endCap === "none" ? "none" : "arrow",
      start: {
        type: "binding",
        boundShapeId: fromShapeId,
        normalizedAnchor: { x: 0.5, y: 0.5 },
        isExact: false,
        isPrecise: false,
      },
      end: {
        type: "binding",
        boundShapeId: toShapeId,
        normalizedAnchor: { x: 0.5, y: 0.5 },
        isExact: false,
        isPrecise: false,
      },
      bend: 0,
      text: edge.label || "",
      labelPosition: 0.5,
    },
    meta: {},
  };
}

// --- Asset conversion ---

function convertAssets(
  assets: IRAsset[],
  nodes: IRNode[],
  useLocalAssets: boolean,
): TldrawAssetRecord[] {
  const records: TldrawAssetRecord[] = [];

  for (const asset of assets) {
    // Find the corresponding image node
    const imageNode = nodes.find(
      (n) => n.type === "image" && n.assetId === asset.id,
    );

    // Determine src: local path for Obsidian, Miro URL for tldraw.com
    const src = useLocalAssets
      ? (asset.localPath || asset.miroUrl || "")
      : (asset.miroUrl || asset.localPath || "");

    // Determine mime type from file path extension
    const pathForExt = asset.localPath || asset.miroUrl || "";
    let mimeType = "image/png";
    const ext = pathForExt.split(".").pop()?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    else if (ext === "svg") mimeType = "image/svg+xml";
    else if (ext === "gif") mimeType = "image/gif";
    else if (ext === "webp") mimeType = "image/webp";

    records.push({
      id: `asset:${asset.id}`,
      typeName: "asset",
      type: "image",
      props: {
        name: asset.localPath || asset.id,
        src,
        w: imageNode ? Math.round(imageNode.width) : 200,
        h: imageNode ? Math.round(imageNode.height) : 200,
        mimeType,
        isAnimated: false,
      },
      meta: {},
    });
  }

  return records;
}
