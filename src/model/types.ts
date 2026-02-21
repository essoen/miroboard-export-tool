// Intermediate Representation (IR) types
// Format-agnostic model between Miro extraction and target format generation

// --- Board ---

export interface IRBoard {
  id: string;
  name: string;
  description?: string;
  sourceUrl: string;
  extractedAt: string; // ISO 8601
  nodes: IRNode[];
  edges: IREdge[];
  assets: IRAsset[];
}

// --- Nodes ---

export type IRNodeType =
  | "sticky_note"
  | "shape"
  | "text"
  | "frame"
  | "image"
  | "card"
  | "embed";

export interface IRNodeBase {
  id: string;
  type: IRNodeType;
  // Position in top-left coordinate system (already transformed from Miro center-origin)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // Degrees
  parentId?: string; // Parent frame ID
  color?: IRColor;
  createdAt?: string;
  modifiedAt?: string;
}

export interface IRStickyNote extends IRNodeBase {
  type: "sticky_note";
  content: string; // Markdown
  textAlign?: "left" | "center" | "right";
}

export interface IRShape extends IRNodeBase {
  type: "shape";
  shapeType: string; // Miro shape subtype (rectangle, circle, etc.)
  content?: string; // Text inside shape
  borderColor?: string; // Hex
  borderWidth?: number;
  borderStyle?: "normal" | "dotted" | "dashed";
}

export interface IRText extends IRNodeBase {
  type: "text";
  content: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface IRFrame extends IRNodeBase {
  type: "frame";
  label: string;
  childIds: string[];
}

export interface IRImage extends IRNodeBase {
  type: "image";
  assetId: string; // References IRAsset.id
  title?: string;
}

export interface IRCard extends IRNodeBase {
  type: "card";
  title: string;
  description?: string;
  tags?: IRTag[];
}

export interface IREmbed extends IRNodeBase {
  type: "embed";
  url: string;
  title?: string;
}

export type IRNode =
  | IRStickyNote
  | IRShape
  | IRText
  | IRFrame
  | IRImage
  | IRCard
  | IREmbed;

// --- Edges ---

export type IRSide = "top" | "right" | "bottom" | "left";

export type IREndCap = "none" | "arrow" | "filled_triangle" | "diamond" | "circle" | "oval";

export interface IREdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromSide?: IRSide;
  toSide?: IRSide;
  label?: string;
  color?: string; // Hex
  lineStyle: "straight" | "curved" | "elbowed";
  startCap: IREndCap;
  endCap: IREndCap;
}

// --- Assets ---

export interface IRAsset {
  id: string;
  miroUrl: string;
  localPath?: string; // Set after download
  mimeType?: string;
  width?: number;
  height?: number;
}

// --- Supporting types ---

export interface IRColor {
  hex: string;
  miroName?: string; // Original Miro color name (e.g. "light_yellow")
}

export interface IRTag {
  id: string;
  title: string;
  color?: string;
}
