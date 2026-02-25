import type { IRBoard, IRNode, IRAsset } from "../../model/types.js";

interface MarkdownFile {
  filename: string;
  content: string;
}

/**
 * Generate markdown files for each content item on the board,
 * plus a board index note.
 */
export function generateMarkdown(
  board: IRBoard,
  canvasFilename?: string,
): MarkdownFile[] {
  const files: MarkdownFile[] = [];
  const usedFilenames = new Set<string>();
  const assetMap = new Map(board.assets.map((a) => [a.id, a]));

  // Filter to content-bearing nodes (sticky notes, cards, text with substantial content, documents with downloaded assets, previews with URLs)
  const contentNodes = board.nodes.filter(
    (n) =>
      n.type === "sticky_note" ||
      n.type === "card" ||
      (n.type === "document" && assetMap.get(`doc_${n.id}`)?.localPath) ||
      (n.type === "preview" && (n.url || n.title)) ||
      (n.type === "text" && getNodeContent(n).length > 20),
  );

  // Generate individual notes
  for (const node of contentNodes) {
    const content = getNodeContent(node);
    if (!content) continue;

    const filename = makeFilename(content, node.id, usedFilenames);
    usedFilenames.add(filename);

    const frontmatter = buildFrontmatter(node, board);
    const body = buildBody(node, assetMap);

    files.push({
      filename: `${filename}.md`,
      content: `${frontmatter}\n${body}\n`,
    });
  }

  // Generate board index
  const index = buildIndex(board, contentNodes, files, canvasFilename);
  files.push({
    filename: `${sanitize(board.name)}-index.md`,
    content: index,
  });

  return files;
}

function getNodeContent(node: IRNode): string {
  switch (node.type) {
    case "sticky_note":
      return node.content;
    case "card":
      return node.title + (node.description ? "\n" + node.description : "");
    case "text":
      return node.content;
    case "shape":
      return node.content || "";
    case "document":
      return node.title;
    case "preview":
      return node.title || node.url || "Preview";
    default:
      return "";
  }
}

function buildFrontmatter(node: IRNode, board: IRBoard): string {
  const lines: string[] = ["---"];
  lines.push(`source: miro`);
  lines.push(`board: "${board.name}"`);
  lines.push(`miro_id: "${node.id}"`);
  lines.push(`type: ${node.type}`);

  if (node.color?.miroName) {
    lines.push(`color: ${node.color.miroName}`);
  }
  if (node.createdAt) {
    lines.push(`created: ${node.createdAt}`);
  }
  if (node.modifiedAt) {
    lines.push(`modified: ${node.modifiedAt}`);
  }

  lines.push("tags:");
  lines.push("  - miro-import");
  lines.push("---");
  return lines.join("\n");
}

function buildBody(node: IRNode, assetMap: Map<string, IRAsset>): string {
  switch (node.type) {
    case "sticky_note":
      return node.content;
    case "card": {
      let body = `# ${node.title}`;
      if (node.description) {
        body += `\n\n${node.description}`;
      }
      return body;
    }
    case "text":
      return node.content;
    case "document": {
      const asset = assetMap.get(`doc_${node.id}`);
      // Asset with localPath guaranteed to exist due to filtering in generateMarkdown
      return `# 📄 ${node.title}\n\n![[${asset!.localPath}]]`;
    }
    case "preview": {
      let body = `# 🔗 ${node.title || "Link Preview"}`;
      if (node.url) {
        body += `\n\n[${node.title || node.url}](${node.url})`;
      }
      if (node.description) {
        body += `\n\n${node.description}`;
      }
      return body;
    }
    default:
      return "";
  }
}

function buildIndex(
  board: IRBoard,
  contentNodes: IRNode[],
  files: MarkdownFile[],
  canvasFilename?: string,
): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`source: miro`);
  lines.push(`board_id: "${board.id}"`);
  lines.push(`import_date: ${board.extractedAt.split("T")[0]}`);
  lines.push("tags:");
  lines.push("  - miro-import");
  lines.push("---");
  lines.push("");
  lines.push(`# ${board.name}`);

  if (board.description) {
    lines.push("");
    lines.push(board.description);
  }

  lines.push("");
  lines.push("## Items");
  lines.push("");

  for (let i = 0; i < contentNodes.length; i++) {
    const node = contentNodes[i];
    const file = files[i];
    const preview = getNodeContent(node).split("\n")[0].slice(0, 60);
    const linkName = file.filename.replace(/\.md$/, "");
    lines.push(`- [[${linkName}]] - ${preview}`);
  }

  if (canvasFilename) {
    lines.push("");
    lines.push("## Visual");
    lines.push("");
    lines.push(`- [[${canvasFilename.replace(/\.canvas$/, "")}]] (Canvas)`);
  }

  lines.push("");
  lines.push("---");
  lines.push(`*Imported from [Miro](${board.sourceUrl})*`);

  return lines.join("\n");
}

function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
}

function makeFilename(
  content: string,
  id: string,
  usedFilenames: Set<string>,
): string {
  // Use first line of content, sanitized
  const firstLine = content.split("\n")[0].trim();
  let base = sanitize(firstLine || `item-${id}`);

  if (!base) base = `item-${id}`;

  let filename = base;
  let counter = 1;
  while (usedFilenames.has(filename)) {
    filename = `${base}-${counter}`;
    counter++;
  }

  return filename;
}
