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
  | "embed"
  | "document"
  | "preview";

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

export interface IRDocument extends IRNodeBase {
  type: "document";
  title: string; // e.g. "introduction-to-okrs.pdf"
  documentUrl: string; // Miro API URL to download the document
}

export interface IRPreview extends IRNodeBase {
  type: "preview";
  url: string; // The previewed URL (may be empty in bulk listing)
  title?: string;
  description?: string;
}

export type IRNode =
  | IRStickyNote
  | IRShape
  | IRText
  | IRFrame
  | IRImage
  | IRCard
  | IREmbed
  | IRDocument
  | IRPreview;

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

// --- Extraction Stats ---

export interface ExtractionStats {
  /** Total items returned by Miro API */
  totalApiItems: number;
  /** Items converted to IR nodes */
  convertedNodes: number;
  /** Items skipped due to unsupported type (e.g. emoji, app_card) */
  skippedItems: Array<{ type: string; id: string }>;
  /** Connectors dropped because start or end item was missing */
  droppedConnectors: number;
  /** Total connectors from API */
  totalApiConnectors: number;
  /** Preview items filtered out (no URL even after detail-fetch) */
  filteredPreviews: number;
  /** Asset downloads that failed */
  failedAssetDownloads: Array<{ id: string; error: string }>;
  /** Detail-fetch failures */
  failedDetailFetches: Array<{ type: string; id: string; error: string }>;
}
