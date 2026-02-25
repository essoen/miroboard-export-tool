import type { IRBoard, IRNode, IREdge, IRFrame, IRAsset } from "../../model/types.js";
import { irColorToDrawioFill, irColorToDrawioStroke } from "./drawio-color-map.js";
import { IdMap } from "../../utils/id-map.js";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Map Miro shapeType to a draw.io style prefix.
 */
function shapeStyle(shapeType: string): string {
  switch (shapeType) {
    case "rectangle":      return "rounded=0";
    case "round_rectangle": return "rounded=1";
    case "circle":
    case "ellipse":        return "ellipse";
    case "triangle":       return "triangle";
    case "rhombus":
    case "diamond":        return "rhombus";
    case "star":           return "shape=mxgraph.basic.star";
    case "right_arrow":    return "shape=mxgraph.arrows2.arrow";
    default:               return "rounded=1";
  }
}

/**
 * Map IREdge lineStyle to draw.io edgeStyle.
 */
function edgeStyle(lineStyle: IREdge["lineStyle"]): string {
  switch (lineStyle) {
    case "straight": return "edgeStyle=none";
    case "curved":   return "edgeStyle=elbowEdgeStyle;curved=1";
    case "elbowed":  return "edgeStyle=orthogonalEdgeStyle";
  }
}

/**
 * Map IREndCap to draw.io arrow marker name.
 */
function arrowMarker(cap: IREdge["startCap"]): string {
  switch (cap) {
    case "none":           return "none";
    case "arrow":
    case "filled_triangle": return "block";
    case "diamond":        return "diamond";
    case "circle":
    case "oval":           return "oval";
    default:               return "none";
  }
}

function renderNodeCell(
  node: IRNode,
  idMap: IdMap,
  assetMap: Map<string, IRAsset>,
  frameMap: Map<string, IRFrame>,
): string {
  const nid = `n${idMap.get(node.id)}`;

  // Determine parent and coordinates
  let parentId = "1";
  let x = Math.round(node.x);
  let y = Math.round(node.y);

  if (node.parentId) {
    const frame = frameMap.get(node.parentId);
    if (frame) {
      parentId = `n${idMap.get(node.parentId)}`;
      x = Math.round(node.x - frame.x);
      y = Math.round(node.y - frame.y);
    }
  }

  const w = Math.round(node.width);
  const h = Math.round(node.height);

  const fillColor = irColorToDrawioFill(node.color);
  const strokeColor = irColorToDrawioStroke(node.color);

  switch (node.type) {
    case "sticky_note": {
      const style = `rounded=1;whiteSpace=wrap;fillColor=${fillColor};strokeColor=${strokeColor};`;
      const value = xmlEscape(node.content || "");
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "shape": {
      const base = shapeStyle(node.shapeType);
      const borderColor = node.borderColor || strokeColor;
      const style = `${base};whiteSpace=wrap;fillColor=${fillColor};strokeColor=${borderColor};`;
      const value = xmlEscape(node.content || "");
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "text": {
      const style = `text;html=0;whiteSpace=wrap;`;
      const value = xmlEscape(node.content || "");
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "frame": {
      const style = `swimlane;fillColor=#dae8fc;strokeColor=#6c8ebf;`;
      const value = xmlEscape(node.label || "");
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "image": {
      const asset = assetMap.get(node.assetId);
      if (asset?.localPath) {
        // file:// URLs work in draw.io Desktop but not in draw.io Web (browser security)
        const url = xmlEscape(`file://${asset.localPath}`);
        const style = `shape=image;image=${url};strokeColor=none;`;
        const value = xmlEscape(node.title || "");
        return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
      }
      if (asset?.miroUrl) {
        const url = xmlEscape(asset.miroUrl);
        const style = `shape=image;image=${url};strokeColor=none;`;
        const value = xmlEscape(node.title || "");
        return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
      }
      // Placeholder when no asset URL available
      const style = `rounded=1;whiteSpace=wrap;fillColor=#f5f5f5;strokeColor=#666666;`;
      const value = xmlEscape(node.title || node.assetId);
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "card": {
      const style = `rounded=1;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;`;
      let text = node.title;
      if (node.description) text += `\n${node.description}`;
      const value = xmlEscape(text);
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "embed": {
      const style = `text;whiteSpace=wrap;`;
      const label = xmlEscape(`${node.title || node.url}\n${node.url}`);
      return `        <mxCell id="${nid}" value="${label}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "document": {
      const style = `rounded=1;whiteSpace=wrap;fillColor=#f5f5f5;strokeColor=#666666;`;
      const value = xmlEscape(`📄 ${node.title}`);
      return `        <mxCell id="${nid}" value="${value}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    case "preview": {
      const style = `text;whiteSpace=wrap;`;
      const label = xmlEscape(`${node.title || node.url}\n${node.url}`);
      return `        <mxCell id="${nid}" value="${label}" style="${style}" vertex="1" parent="${parentId}">
          <mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>
        </mxCell>`;
    }

    default:
      return "";
  }
}

function renderEdgeCell(edge: IREdge, idMap: IdMap, nodeIds: Set<string>): string {
  if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) return "";

  const eid = `e${idMap.get(edge.id)}`;
  const source = `n${idMap.get(edge.fromNodeId)}`;
  const target = `n${idMap.get(edge.toNodeId)}`;

  const style = [
    edgeStyle(edge.lineStyle),
    `startArrow=${arrowMarker(edge.startCap)}`,
    `endArrow=${arrowMarker(edge.endCap)}`,
    edge.color ? `strokeColor=${edge.color}` : "",
  ].filter(Boolean).join(";") + ";";

  const value = xmlEscape(edge.label || "");

  return `        <mxCell id="${eid}" value="${value}" style="${style}" edge="1" source="${source}" target="${target}" parent="1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`;
}

/**
 * Generate a draw.io XML (.drawio) file from an IR board.
 */
export function generateDrawio(board: IRBoard): string {
  const idMap = new IdMap();
  const assetMap = new Map(board.assets.map((a) => [a.id, a]));
  const nodeIds = new Set(board.nodes.map((n) => n.id));

  // Build frame lookup for child coord resolution
  const frameMap = new Map<string, IRFrame>(
    board.nodes
      .filter((n): n is IRFrame => n.type === "frame")
      .map((f) => [f.id, f]),
  );

  // Frames first (lower z-index), then other nodes
  const frames = board.nodes.filter((n) => n.type === "frame");
  const others = board.nodes.filter((n) => n.type !== "frame");

  const cells: string[] = [];

  for (const node of [...frames, ...others]) {
    const cell = renderNodeCell(node, idMap, assetMap, frameMap);
    if (cell) cells.push(cell);
  }

  for (const edge of board.edges) {
    const cell = renderEdgeCell(edge, idMap, nodeIds);
    if (cell) cells.push(cell);
  }

  const boardName = xmlEscape(board.name);

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile>
  <diagram name="${boardName}">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${cells.join("\n")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}
