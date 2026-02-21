import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { extractBoard } from "./extract/miro-extractor.js";
import { generateCanvas } from "./generate/canvas-generator.js";
import { generateMarkdown } from "./generate/markdown-generator.js";

/**
 * Parse a Miro board URL or ID into a board ID.
 * Accepts:
 *   - Full URL: https://miro.com/app/board/uXjVNxxxxx=/
 *   - Board ID: uXjVNxxxxx=
 */
function parseBoardId(input: string): string {
  const urlMatch = input.match(
    /miro\.com\/app\/board\/([a-zA-Z0-9_=-]+)/,
  );
  if (urlMatch) return urlMatch[1];
  return input;
}

export function createCli(): Command {
  const program = new Command();

  program
    .name("miro-migrate")
    .description("Migrate Miro boards to Obsidian Canvas and Markdown")
    .version("0.1.0")
    .argument("<board-url-or-id>", "Miro board URL or board ID")
    .option(
      "-t, --token <token>",
      "Miro API access token (or set MIRO_ACCESS_TOKEN env var)",
    )
    .option("-o, --output <dir>", "Output directory", "./miro-export")
    .option(
      "-f, --format <formats>",
      "Output formats (comma-separated: canvas,markdown)",
      "canvas,markdown",
    )
    .option("--vault <path>", "Write directly into Obsidian vault")
    .option("--no-images", "Skip image download")
    .option("--scale <number>", "Coordinate scale factor", "1.0")
    .option("--dry-run", "Preview without writing files")
    .option("--verbose", "Enable detailed logging")
    .action(async (boardInput: string, options) => {
      const token = options.token || process.env.MIRO_ACCESS_TOKEN;
      if (!token) {
        console.error(
          "Error: Miro access token required. Use --token or set MIRO_ACCESS_TOKEN.",
        );
        process.exit(1);
      }

      const boardId = parseBoardId(boardInput);
      const formats = (options.format as string).split(",").map((f: string) => f.trim());
      const outputDir = options.vault || options.output;
      const verbose = options.verbose || false;
      const dryRun = options.dryRun || false;
      const downloadImages = options.images !== false;

      console.log(`Extracting board: ${boardId}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(`Formats: ${formats.join(", ")}`);

      // Extract board data from Miro
      const board = await extractBoard({
        token,
        boardId,
        downloadImages: downloadImages && !dryRun,
        outputDir: dryRun ? undefined : outputDir,
        verbose,
      });

      console.log(
        `Extracted: ${board.nodes.length} nodes, ${board.edges.length} edges, ${board.assets.length} assets`,
      );

      if (dryRun) {
        console.log("\nDry run - no files written.");
        console.log("\nNodes by type:");
        const counts = new Map<string, number>();
        for (const node of board.nodes) {
          counts.set(node.type, (counts.get(node.type) || 0) + 1);
        }
        for (const [type, count] of counts) {
          console.log(`  ${type}: ${count}`);
        }
        return;
      }

      await mkdir(outputDir, { recursive: true });

      const boardBasename = board.name
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, "-");

      // Generate Canvas
      if (formats.includes("canvas")) {
        const canvasJson = generateCanvas(board);
        const canvasFilename = `${boardBasename}.canvas`;
        const canvasPath = join(outputDir, canvasFilename);
        await writeFile(canvasPath, canvasJson, "utf-8");
        console.log(`Written: ${canvasPath}`);
      }

      // Generate Markdown
      if (formats.includes("markdown")) {
        const canvasFilename = formats.includes("canvas")
          ? `${boardBasename}.canvas`
          : undefined;
        const mdFiles = generateMarkdown(board, canvasFilename);
        const mdDir = join(outputDir, "miro-notes");
        await mkdir(mdDir, { recursive: true });

        for (const file of mdFiles) {
          const filePath = join(mdDir, file.filename);
          await writeFile(filePath, file.content, "utf-8");
        }
        console.log(`Written: ${mdFiles.length} markdown files to ${mdDir}`);
      }

      console.log("\nDone!");
    });

  return program;
}
