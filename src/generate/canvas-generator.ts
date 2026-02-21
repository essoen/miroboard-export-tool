import type { IRBoard, IRNode, IREdge, IRSide } from "../model/types.js";
import { irColorToCanvasColor } from "../model/color-map.js";
import { IdMap } from "../utils/id-map.js";

// JSON Canvas types (jsoncanvas.org spec 1.0)

interface CanvasFile {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

interface CanvasNodeBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

interface CanvasTextNode extends CanvasNodeBase {
  type: "text";
  text: string;
}

interface CanvasFileNode extends CanvasNodeBase {
  type: "file";
  file: string;
  subpath?: string;
}

interface CanvasLinkNode extends CanvasNodeBase {
  type: "link";
  url: string;
}

interface CanvasGroupNode extends CanvasNodeBase {
  type: "group";
  label?: string;
}

type CanvasSide = "top" | "right" | "bottom" | "left";
type CanvasEnd = "none" | "arrow";

interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasSide;
  toSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
}

/**
 * Generate a JSON Canvas (.canvas) file from an IR board.
 */
export function generateCanvas(board: IRBoard): string {
  const idMap = new IdMap();
  const assetMap = new Map(board.assets.map((a) => [a.id, a]));

  // Track which node IDs actually exist (for edge validation)
  const nodeIds = new Set(board.nodes.map((n) => n.id));

  const nodes: CanvasNode[] = [];

  // Generate nodes - groups first (lower z-index), then content on top
  const groups = board.nodes.filter((n) => n.type === "frame");
  const others = board.nodes.filter((n) => n.type !== "frame");

  for (const node of [...groups, ...others]) {
    const canvasNode = convertNode(node, idMap, assetMap);
    if (canvasNode) nodes.push(canvasNode);
  }

  // Generate edges (only for connectors where both endpoints exist)
  const edges: CanvasEdge[] = [];
  for (const edge of board.edges) {
    if (nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)) {
      edges.push(convertEdge(edge, idMap));
    }
  }

  const canvas: CanvasFile = { nodes, edges };
  return JSON.stringify(canvas, null, 2);
}

function convertNode(
  node: IRNode,
  idMap: IdMap,
  assetMap: Map<string, { localPath?: string; miroUrl: string }>,
): CanvasNode | null {
  const base: CanvasNodeBase = {
    id: idMap.get(node.id),
    x: Math.round(node.x),
    y: Math.round(node.y),
    width: Math.round(node.width),
    height: Math.round(node.height),
  };

  const color = irColorToCanvasColor(node.color);
  if (color) base.color = color;

  switch (node.type) {
    case "sticky_note":
      return { ...base, type: "text", text: node.content || "" };

    case "shape": {
      let text = node.content || "";
      // If shape has no text content, add shape type as context
      if (!text && node.shapeType !== "rectangle") {
        text = `[${node.shapeType}]`;
      }
      return { ...base, type: "text", text };
    }

    case "text":
      return { ...base, type: "text", text: node.content || "" };

    case "frame":
      return { ...base, type: "group", label: node.label || undefined };

    case "image": {
      const asset = assetMap.get(node.assetId);
      if (asset?.localPath) {
        return { ...base, type: "file", file: asset.localPath };
      }
      if (asset?.miroUrl) {
        return { ...base, type: "link", url: asset.miroUrl };
      }
      return { ...base, type: "text", text: `[Image: ${node.title || node.assetId}]` };
    }

    case "card": {
      let text = `**${node.title}**`;
      if (node.description) {
        text += `\n\n${node.description}`;
      }
      return { ...base, type: "text", text };
    }

    case "embed":
      return { ...base, type: "link", url: node.url || "" };

    default:
      return null;
  }
}

function convertEdge(edge: IREdge, idMap: IdMap): CanvasEdge {
  const result: CanvasEdge = {
    id: idMap.get(edge.id),
    fromNode: idMap.get(edge.fromNodeId),
    toNode: idMap.get(edge.toNodeId),
  };

  if (edge.fromSide) result.fromSide = edge.fromSide;
  if (edge.toSide) result.toSide = edge.toSide;

  // Canvas only supports "none" and "arrow" for ends
  result.fromEnd = edge.startCap === "none" ? "none" : "arrow";
  result.toEnd = edge.endCap === "none" ? "none" : "arrow";

  if (edge.color) result.color = edge.color;
  if (edge.label) result.label = edge.label;

  return result;
}
