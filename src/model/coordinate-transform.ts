import type { IRNode } from "./types.js";

interface MiroPosition {
  x: number; // Center of item, relative to canvas center
  y: number;
}

interface MiroGeometry {
  width: number;
  height: number;
}

const DEFAULT_MARGIN = 100;

/**
 * Convert a single Miro item's center-origin position to top-left corner position.
 * Miro: position is center of item, (0,0) is center of board.
 * Canvas/tldraw: position is top-left corner of node.
 */
export function miroToTopLeft(
  position: MiroPosition,
  geometry: MiroGeometry,
): { x: number; y: number } {
  return {
    x: position.x - geometry.width / 2,
    y: position.y - geometry.height / 2,
  };
}

/**
 * Shift all node coordinates so that the minimum x,y is at +margin.
 * This normalizes the board into positive coordinate space.
 * Mutates the nodes in place and returns them.
 */
export function normalizeToPositiveSpace(
  nodes: IRNode[],
  margin: number = DEFAULT_MARGIN,
): IRNode[] {
  if (nodes.length === 0) return nodes;

  let minX = Infinity;
  let minY = Infinity;

  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
  }

  const offsetX = -minX + margin;
  const offsetY = -minY + margin;

  for (const node of nodes) {
    node.x += offsetX;
    node.y += offsetY;
  }

  return nodes;
}
