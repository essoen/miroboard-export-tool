import { MiroApi } from "@mirohq/miro-api";
import type {
  IRBoard,
  IRNode,
  IREdge,
  IRAsset,
  IRStickyNote,
  IRShape,
  IRText,
  IRFrame,
  IRImage,
  IRCard,
  IREmbed,
  IRDocument,
  IRPreview,
  IREndCap,
  ExtractionStats,
} from "../model/types.js";
import { parseMiroColor } from "../model/color.js";
import {
  miroToTopLeft,
  normalizeToPositiveSpace,
} from "../model/coordinate-transform.js";
import { htmlToMarkdown } from "../utils/html-to-markdown.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import { downloadImage } from "./image-downloader.js";

export type ProgressPhase = "items" | "connectors" | "details" | "assets";

export interface ProgressEvent {
  phase: ProgressPhase;
  current: number;
  total?: number; // Unknown for items/connectors (streaming), known for assets
  message?: string;
}

export interface ExtractOptions {
  token: string;
  boardId: string;
  downloadImages?: boolean;
  outputDir?: string;
  verbose?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  /** Prefix for asset paths in generated output (e.g. "miro-import/" for vault-relative paths) */
  assetPathPrefix?: string;
}

export interface ExtractionResult {
  board: IRBoard;
  stats: ExtractionStats;
}

/**
 * Process items in concurrent batches.
 * Each batch runs up to `concurrency` items in parallel via Promise.allSettled.
 */
export async function batchProcess<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.allSettled(batch.map(fn));
  }
}

/**
 * Extract a Miro board into our intermediate representation.
 */
export async function extractBoard(
  options: ExtractOptions,
): Promise<ExtractionResult> {
  const { token, boardId, downloadImages = true, outputDir, verbose, onProgress, assetPathPrefix } = options;
  const log = verbose ? console.log.bind(console) : () => {};
  const progress = onProgress || (() => {});

  // Track extraction stats
  const stats: ExtractionStats = {
    totalApiItems: 0,
    convertedNodes: 0,
    skippedItems: [],
    droppedConnectors: 0,
    totalApiConnectors: 0,
    filteredPreviews: 0,
    failedAssetDownloads: [],
    failedDetailFetches: [],
  };

  const api = new MiroApi(token);
  const board = await api.getBoard(boardId);

  log(`Extracting board: ${board.name} (${boardId})`);

  const rateLimiter = new RateLimiter(800);

  // Collect all items
  const nodes: IRNode[] = [];
  const assets: IRAsset[] = [];
  const frameChildMap = new Map<string, string[]>(); // frameId -> childIds

  // Track raw Miro items for parent-relative coordinate resolution
  const rawItems: Array<{ item: any; node: IRNode }> = [];

  log("Fetching items...");
  let itemCount = 0;

  for await (const item of board.getAllItems()) {
    await rateLimiter.acquire();
    itemCount++;
    progress({ phase: "items", current: itemCount });

    const node = convertItem(item);
    if (node) {
      nodes.push(node);
      rawItems.push({ item, node });
      stats.convertedNodes++;

      // Track parent-child relationships for frames
      const parentId = (item as any).parent?.id;
      if (parentId) {
        const children = frameChildMap.get(parentId) || [];
        children.push(item.id!.toString());
        frameChildMap.set(parentId, children);
      }

      // Track image assets
      if (node.type === "image") {
        assets.push({
          id: node.assetId,
          miroUrl: (item as any).data?.imageUrl || "",
        });
      }

      // Track document assets (PDFs)
      if (node.type === "document") {
        assets.push({
          id: `doc_${node.id}`,
          miroUrl: (item as any).data?.documentUrl || "",
        });
      }
    } else {
      // Track skipped items (unsupported types like emoji, app_card)
      const itemType = item.type || "unknown";
      const itemId = item.id?.toString() || "?";
      stats.skippedItems.push({ type: itemType, id: itemId });
    }
  }

  stats.totalApiItems = itemCount;
  log(`Fetched ${itemCount} items, converted ${nodes.length} nodes`);

  // === Detail-fetch: style data + preview URLs ===
  // The bulk getAllItems() omits style fields for sticky_note/text/shape,
  // and returns no data for preview items.
  // Type-specific v2 endpoints return full style data (fillColor, fontSize, etc).
  // Preview URLs are only available via the v1 REST API.
  const needsStyleDetail = rawItems.filter(({ node }) =>
    node.type === "sticky_note" || node.type === "text" || node.type === "shape",
  );
  const needsPreviewDetail = rawItems.filter(({ node }) => node.type === "preview");
  const totalDetails = needsStyleDetail.length + needsPreviewDetail.length;

  if (totalDetails > 0) {
    log(`Fetching details for ${totalDetails} items (${needsStyleDetail.length} styled, ${needsPreviewDetail.length} previews)...`);
    let detailCount = 0;

    // Pass 1: Style details via v2 typed endpoints (concurrent)
    await batchProcess(needsStyleDetail, 10, async ({ node }) => {
      detailCount++;
      progress({ phase: "details", current: detailCount, total: totalDetails });
      try {
        await rateLimiter.acquire();
        let detail: any;
        switch (node.type) {
          case "sticky_note":
            detail = (await (board as any)._api.getStickyNoteItem(boardId, node.id)).body;
            break;
          case "text":
            detail = (await (board as any)._api.getTextItem(boardId, node.id)).body;
            break;
          case "shape":
            detail = (await (board as any)._api.getShapeItem(boardId, node.id)).body;
            break;
        }
        if (detail?.style) {
          const fillColor = detail.style.fillColor;
          if (fillColor) {
            (node as any).color = parseMiroColor(fillColor);
          }
          if (node.type === "sticky_note") {
            const sn = node as IRStickyNote;
            sn.textAlign = detail.style.textAlign || sn.textAlign;
          }
          if (node.type === "text") {
            const tn = node as IRText;
            tn.fontSize = detail.style.fontSize ? parseFloat(detail.style.fontSize) : tn.fontSize;
            tn.fontFamily = detail.style.fontFamily || tn.fontFamily;
          }
          if (node.type === "shape") {
            const sn = node as IRShape;
            sn.borderColor = detail.style.borderColor || sn.borderColor;
            sn.borderWidth = detail.style.borderWidth ? parseFloat(detail.style.borderWidth) : sn.borderWidth;
            sn.borderStyle = detail.style.borderStyle || sn.borderStyle;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.failedDetailFetches.push({ type: node.type, id: node.id, error: msg });
        log(`  Warning: Failed to fetch detail for ${node.type} ${node.id}: ${err}`);
      }
    });

    // Pass 2: Preview URLs via Miro v1 REST API (concurrent)
    // v2 API returns isSupported:false for previews; v1 /widgets/{id} returns url+title.
    await batchProcess(needsPreviewDetail, 10, async ({ node }) => {
      detailCount++;
      progress({ phase: "details", current: detailCount, total: totalDetails });
      try {
        await rateLimiter.acquire();
        const resp = await fetch(
          `https://api.miro.com/v1/boards/${boardId}/widgets/${node.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (resp.ok) {
          const data = (await resp.json()) as { url?: string; title?: string };
          const preview = node as IRPreview;
          preview.url = data.url || preview.url;
          preview.title = data.title || preview.title;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.failedDetailFetches.push({ type: "preview", id: node.id, error: msg });
        log(`  Warning: Failed to fetch preview detail for ${node.id}: ${err}`);
      }
    });

    log(`Detail-fetch complete`);
  }

  // Remove preview items that still have no URL (useless without links)
  const filteredNodes = nodes.filter((n) => {
    if (n.type === "preview" && !(n as IRPreview).url) return false;
    return true;
  });
  stats.filteredPreviews = nodes.length - filteredNodes.length;
  if (stats.filteredPreviews > 0) {
    log(`Filtered out ${stats.filteredPreviews} preview items without URLs`);
  }

  // Fill in frame childIds
  for (const node of filteredNodes) {
    if (node.type === "frame") {
      node.childIds = frameChildMap.get(node.id) || [];
    }
  }

  // Resolve parent-relative coordinates to absolute board coordinates.
  // Items with position.relativeTo === "parent_top_left" have coordinates
  // relative to their parent frame's top-left corner, not the board center.
  // We need to convert these to board-absolute coordinates.
  const nodeById = new Map(filteredNodes.map((n) => [n.id, n]));
  for (const { item, node } of rawItems) {
    const pos = item.position;
    if (pos?.relativeTo === "parent_top_left" && node.parentId) {
      const parent = nodeById.get(node.parentId);
      if (parent) {
        // Parent was already converted via miroToTopLeft (center→top-left of parent).
        // The child's Miro position is center-of-child relative to parent's top-left.
        // Our convertItem already did miroToTopLeft on the child's position,
        // giving us (childCenter.x - childW/2, childCenter.y - childH/2).
        // That's the child's top-left *relative to parent's top-left*.
        // We need to add the parent's absolute top-left position.
        node.x += parent.x;
        node.y += parent.y;
      }
    }
  }

  // Collect all connectors
  log("Fetching connectors...");
  const edges: IREdge[] = [];
  let connectorCount = 0;

  for await (const connector of board.getAllConnectors()) {
    await rateLimiter.acquire();
    connectorCount++;
    progress({ phase: "connectors", current: connectorCount });

    const edge = convertConnector(connector);
    if (edge) {
      edges.push(edge);
    } else {
      stats.droppedConnectors++;
    }
  }

  stats.totalApiConnectors = connectorCount;
  log(`Fetched ${edges.length} connectors (${stats.droppedConnectors} dropped)`);

  // Download images if requested
  if (downloadImages && outputDir && assets.length > 0) {
    log(`Downloading ${assets.length} assets...`);
    let downloadCount = 0;
    const downloadableAssets = assets.filter((a) => a.miroUrl);
    const downloadTotal = downloadableAssets.length;
    await batchProcess(downloadableAssets, 5, async (asset) => {
      downloadCount++;
      progress({ phase: "assets", current: downloadCount, total: downloadTotal, message: asset.id });
      try {
        await rateLimiter.acquire();
        const localPath = await downloadImage(
          asset.miroUrl,
          outputDir,
          asset.id,
          token,
          assetPathPrefix,
        );
        asset.localPath = localPath;
        log(`  Downloaded: ${localPath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.failedAssetDownloads.push({ id: asset.id, error: msg });
        log(`  Warning: Failed to download asset ${asset.id}: ${err}`);
      }
    });
  }

  // Normalize coordinates to positive space
  normalizeToPositiveSpace(filteredNodes);

  const boardUrl = `https://miro.com/app/board/${boardId}/`;

  return {
    board: {
      id: boardId,
      name: board.name || "Untitled Board",
      description: board.description || undefined,
      sourceUrl: boardUrl,
      extractedAt: new Date().toISOString(),
      nodes: filteredNodes,
      edges,
      assets,
    },
    stats,
  };
}

function convertItem(item: any): IRNode | null {
  const type = item.type;
  const id = item.id?.toString();
  if (!id) return null;

  const pos = item.position;
  const geo = item.geometry;
  if (!pos || !geo) return null;

  const topLeft = miroToTopLeft(
    { x: pos.x ?? 0, y: pos.y ?? 0 },
    { width: geo.width ?? 0, height: geo.height ?? 0 },
  );

  const base = {
    id,
    x: topLeft.x,
    y: topLeft.y,
    width: geo.width ?? 100,
    height: geo.height ?? 100,
    rotation: geo.rotation ?? 0,
    parentId: item.parent?.id?.toString() ?? undefined,
    createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
    modifiedAt: item.modifiedAt?.toISOString?.() ?? item.modifiedAt,
  };

  switch (type) {
    case "sticky_note": {
      const data = item.data || {};
      const style = item.style || {};
      return {
        ...base,
        type: "sticky_note",
        content: htmlToMarkdown(data.content || ""),
        textAlign: style.textAlign || "center",
        color: parseMiroColor(style.fillColor),
      } satisfies IRStickyNote;
    }

    case "shape": {
      const data = item.data || {};
      const style = item.style || {};
      return {
        ...base,
        type: "shape",
        shapeType: data.shape || "rectangle",
        content: htmlToMarkdown(data.content || ""),
        color: parseMiroColor(style.fillColor),
        borderColor: style.borderColor,
        borderWidth: style.borderWidth ? parseFloat(style.borderWidth) : undefined,
        borderStyle: style.borderStyle,
      } satisfies IRShape;
    }

    case "text": {
      const data = item.data || {};
      const style = item.style || {};
      return {
        ...base,
        type: "text",
        content: htmlToMarkdown(data.content || ""),
        fontSize: style.fontSize ? parseFloat(style.fontSize) : undefined,
        fontFamily: style.fontFamily,
        color: parseMiroColor(style.color),
      } satisfies IRText;
    }

    case "frame": {
      const data = item.data || {};
      return {
        ...base,
        type: "frame",
        label: data.title || "Frame",
        childIds: [], // Filled in later
      } satisfies IRFrame;
    }

    case "image": {
      const data = item.data || {};
      const assetId = `img_${id}`;
      return {
        ...base,
        type: "image",
        assetId,
        title: data.title,
      } satisfies IRImage;
    }

    case "card": {
      const data = item.data || {};
      return {
        ...base,
        type: "card",
        title: htmlToMarkdown(data.title || "Card"),
        description: data.description
          ? htmlToMarkdown(data.description)
          : undefined,
      } satisfies IRCard;
    }

    case "embed": {
      const data = item.data || {};
      return {
        ...base,
        type: "embed",
        url: data.url || "",
        title: data.title,
      } satisfies IREmbed;
    }

    case "document": {
      const data = item.data || {};
      return {
        ...base,
        type: "document",
        title: data.title || "Document",
        documentUrl: data.documentUrl || "",
      } satisfies IRDocument;
    }

    case "preview": {
      // Preview items (URL/bookmark cards) often lack data in bulk listing.
      // We store position/size; the URL may need a detail fetch.
      const data = item.data || {};
      return {
        ...base,
        type: "preview",
        url: data.url || "",
        title: data.title || "",
        description: data.description || "",
      } satisfies IRPreview;
    }

    default:
      // Unsupported type (app_card, emoji, etc.) - skip
      return null;
  }
}

function mapStrokeCap(cap: string | undefined): IREndCap {
  if (!cap || cap === "none") return "none";
  if (cap === "stealth" || cap === "arrow" || cap === "open_arrow")
    return "arrow";
  if (cap === "filled_triangle") return "filled_triangle";
  if (cap === "filled_diamond" || cap === "diamond") return "diamond";
  if (cap === "filled_oval" || cap === "oval") return "oval";
  if (cap === "circle" || cap === "filled_circle") return "circle";
  return "arrow"; // Default fallback
}

function convertConnector(connector: any): IREdge | null {
  const id = connector.id?.toString();
  if (!id) return null;

  const startId = connector.startItem?.id?.toString();
  const endId = connector.endItem?.id?.toString();
  if (!startId || !endId) return null;

  const style = connector.style || {};
  const captions = connector.captions || [];
  const label = captions.length > 0 ? captions[0].content : undefined;

  return {
    id,
    fromNodeId: startId,
    toNodeId: endId,
    label: label ? htmlToMarkdown(label) : undefined,
    color: style.strokeColor,
    lineStyle:
      connector.shape === "curved"
        ? "curved"
        : connector.shape === "elbowed"
          ? "elbowed"
          : "straight",
    startCap: mapStrokeCap(style.startStrokeCap),
    endCap: mapStrokeCap(style.endStrokeCap),
  };
}
