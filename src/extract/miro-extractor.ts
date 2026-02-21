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
  IREndCap,
} from "../model/types.js";
import { parseMiroColor } from "../model/color-map.js";
import {
  miroToTopLeft,
  normalizeToPositiveSpace,
} from "../model/coordinate-transform.js";
import { htmlToMarkdown } from "../utils/html-to-markdown.js";
import { RateLimiter } from "../utils/rate-limiter.js";
import { downloadImage } from "./image-downloader.js";

export interface ExtractOptions {
  token: string;
  boardId: string;
  downloadImages?: boolean;
  outputDir?: string;
  verbose?: boolean;
}

/**
 * Extract a Miro board into our intermediate representation.
 */
export async function extractBoard(
  options: ExtractOptions,
): Promise<IRBoard> {
  const { token, boardId, downloadImages = true, outputDir, verbose } = options;
  const log = verbose ? console.log.bind(console) : () => {};

  const api = new MiroApi(token);
  const board = await api.getBoard(boardId);

  log(`Extracting board: ${board.name} (${boardId})`);

  const rateLimiter = new RateLimiter(800);

  // Collect all items
  const nodes: IRNode[] = [];
  const assets: IRAsset[] = [];
  const frameChildMap = new Map<string, string[]>(); // frameId -> childIds

  log("Fetching items...");
  let itemCount = 0;

  for await (const item of board.getAllItems()) {
    await rateLimiter.acquire();
    itemCount++;

    const node = convertItem(item);
    if (node) {
      nodes.push(node);

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
    }
  }

  log(`Fetched ${itemCount} items, converted ${nodes.length} nodes`);

  // Fill in frame childIds
  for (const node of nodes) {
    if (node.type === "frame") {
      node.childIds = frameChildMap.get(node.id) || [];
    }
  }

  // Collect all connectors
  log("Fetching connectors...");
  const edges: IREdge[] = [];

  for await (const connector of board.getAllConnectors()) {
    await rateLimiter.acquire();

    const edge = convertConnector(connector);
    if (edge) {
      edges.push(edge);
    }
  }

  log(`Fetched ${edges.length} connectors`);

  // Download images if requested
  if (downloadImages && outputDir && assets.length > 0) {
    log(`Downloading ${assets.length} images...`);
    for (const asset of assets) {
      if (asset.miroUrl) {
        try {
          await rateLimiter.acquire();
          const localPath = await downloadImage(
            asset.miroUrl,
            outputDir,
            asset.id,
            token,
          );
          asset.localPath = localPath;
          log(`  Downloaded: ${localPath}`);
        } catch (err) {
          log(`  Warning: Failed to download image ${asset.id}: ${err}`);
        }
      }
    }
  }

  // Normalize coordinates to positive space
  normalizeToPositiveSpace(nodes);

  const boardUrl = `https://miro.com/app/board/${boardId}/`;

  return {
    id: boardId,
    name: board.name || "Untitled Board",
    description: board.description || undefined,
    sourceUrl: boardUrl,
    extractedAt: new Date().toISOString(),
    nodes,
    edges,
    assets,
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

    default:
      // Unsupported type (app_card, document, preview) - skip with warning
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
