import { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { extractBoard } from "./extract/miro-extractor.js";
import { generateCanvas } from "./generate/canvas/canvas-generator.js";
import { generateMarkdown } from "./generate/markdown/markdown-generator.js";
import { generateTldraw } from "./generate/tldraw/tldraw-generator.js";
import { wrapTldrawForObsidian } from "./generate/tldraw/tldraw-obsidian-wrapper.js";
import { createProgressHandler, finishProgress } from "./utils/progress.js";

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

/**
 * Check if any options beyond the board URL were explicitly provided.
 */
function hasExplicitOptions(opts: any): boolean {
  // commander stores defaults vs explicit values — we check if user passed anything
  // beyond the board argument. Token via env var doesn't count as "explicit option".
  return !!(
    opts.token ||
    opts.vault ||
    opts.dryRun ||
    opts.verbose ||
    opts.images === false ||
    opts.output !== "./miro-export" ||
    opts.format !== "canvas,markdown" ||
    opts.scale !== "1.0" ||
    opts.tldrawFormat !== "both"
  );
}

interface InteractiveOptions {
  token: string;
  outputDir: string;
  formats: string[];
  downloadImages: boolean;
  dryRun: boolean;
  verbose: boolean;
  tldrawFormat: "tldr" | "obsidian" | "both";
}

/**
 * Prompt the user for options interactively.
 */
async function promptOptions(boardId: string): Promise<InteractiveOptions> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(`\n  Board: ${boardId}\n`);

    // Token
    const envToken = process.env.MIRO_ACCESS_TOKEN;
    let token = envToken || "";
    if (!envToken) {
      token = await rl.question("  Miro access token: ");
      if (!token.trim()) {
        console.error("  Error: Token is required.");
        process.exit(1);
      }
    } else {
      console.log("  Token: using MIRO_ACCESS_TOKEN from env");
    }

    // Output directory
    const outputAnswer = await rl.question("  Output directory [./miro-export]: ");
    const outputDir = outputAnswer.trim() || "./miro-export";

    // Formats
    const formatAnswer = await rl.question("  Formats — canvas, markdown, tldraw, or all [canvas,markdown]: ");
    let formats: string[];
    const fmt = formatAnswer.trim().toLowerCase();
    if (fmt === "canvas") {
      formats = ["canvas"];
    } else if (fmt === "markdown") {
      formats = ["markdown"];
    } else if (fmt === "tldraw") {
      formats = ["tldraw"];
    } else if (fmt === "all") {
      formats = ["canvas", "markdown", "tldraw"];
    } else {
      formats = ["canvas", "markdown"];
    }

    // If tldraw selected, ask for sub-format
    let tldrawFormat: "tldr" | "obsidian" | "both" = "both";
    if (formats.includes("tldraw")) {
      const tldrawAnswer = await rl.question("  tldraw output — tldr, obsidian, or both [both]: ");
      const tldrawFmt = tldrawAnswer.trim().toLowerCase();
      tldrawFormat = tldrawFmt === "tldr" ? "tldr" : tldrawFmt === "obsidian" ? "obsidian" : "both";
    }

    // Download images
    const imgAnswer = await rl.question("  Download images? [Y/n]: ");
    const downloadImages = imgAnswer.trim().toLowerCase() !== "n";

    // Dry run
    const dryAnswer = await rl.question("  Dry run (preview only)? [y/N]: ");
    const dryRun = dryAnswer.trim().toLowerCase() === "y";

    // Verbose
    const verboseAnswer = await rl.question("  Verbose logging? [y/N]: ");
    const verbose = verboseAnswer.trim().toLowerCase() === "y";

    console.log("");
    return { token: token.trim(), outputDir, formats, downloadImages, dryRun, verbose, tldrawFormat };
  } finally {
    rl.close();
  }
}

export function createCli(): Command {
  const program = new Command();

  program
    .name("miro-migrate")
    .description("Migrate Miro boards to Obsidian Canvas, Markdown, and tldraw")
    .version("0.1.0")
    .argument("<board-url-or-id>", "Miro board URL or board ID")
    .option(
      "-t, --token <token>",
      "Miro API access token (or set MIRO_ACCESS_TOKEN env var)",
    )
    .option("-o, --output <dir>", "Output directory", "./miro-export")
    .option(
      "-f, --format <formats>",
      "Output formats (comma-separated: canvas,markdown,tldraw)",
      "canvas,markdown",
    )
    .option("--vault <path>", "Write directly into Obsidian vault")
    .option("--no-images", "Skip image download")
    .option("--scale <number>", "Coordinate scale factor", "1.0")
    .option("--dry-run", "Preview without writing files")
    .option("--verbose", "Enable detailed logging")
    .option(
      "--tldraw-format <format>",
      "tldraw output: tldr, obsidian, or both (default: both)",
      "both",
    )
    .action(async (boardInput: string, options) => {
      const boardId = parseBoardId(boardInput);
      const interactive = !hasExplicitOptions(options) && !process.env.MIRO_ACCESS_TOKEN;

      let token: string;
      let formats: string[];
      let outputDir: string;
      let verbose: boolean;
      let dryRun: boolean;
      let downloadImages: boolean;
      let tldrawFormat: "tldr" | "obsidian" | "both" = "both";

      if (interactive) {
        // No options provided — ask the user interactively
        const prompted = await promptOptions(boardId);
        token = prompted.token;
        formats = prompted.formats;
        outputDir = prompted.outputDir;
        verbose = prompted.verbose;
        dryRun = prompted.dryRun;
        downloadImages = prompted.downloadImages;
        tldrawFormat = prompted.tldrawFormat;
      } else {
        // Options provided via flags / env — use them directly
        token = options.token || process.env.MIRO_ACCESS_TOKEN;
        if (!token) {
          console.error(
            "Error: Miro access token required. Use --token or set MIRO_ACCESS_TOKEN.",
          );
          process.exit(1);
        }
        formats = (options.format as string).split(",").map((f: string) => f.trim());
        outputDir = options.vault || options.output;
        verbose = options.verbose || false;
        dryRun = options.dryRun || false;
        downloadImages = options.images !== false;
        const tf = (options.tldrawFormat || "both").toLowerCase();
        tldrawFormat = tf === "tldr" ? "tldr" : tf === "obsidian" ? "obsidian" : "both";
      }

      console.log(`Extracting board: ${boardId}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(`Formats: ${formats.join(", ")}`);
      console.log("");

      // Compute vault-relative asset path prefix when --vault is used.
      // Obsidian Canvas "file" paths are resolved from the vault root.
      // If output is ~/vault/miro-import/ and vault is ~/vault/,
      // then prefix is "miro-import/" so file paths become "miro-import/assets/img.png".
      let assetPathPrefix: string | undefined;
      const vaultRoot = options.vault;
      if (vaultRoot && !dryRun) {
        const absOutput = resolve(outputDir);
        const absVault = resolve(vaultRoot);
        const rel = relative(absVault, absOutput);
        if (rel && !rel.startsWith("..")) {
          assetPathPrefix = rel + "/";
        }
      }

      // Extract board data from Miro (with progress bar)
      const onProgress = verbose ? undefined : createProgressHandler();
      const { board, stats } = await extractBoard({
        token,
        boardId,
        downloadImages: downloadImages && !dryRun,
        outputDir: dryRun ? undefined : outputDir,
        verbose,
        onProgress,
        assetPathPrefix,
      });
      if (onProgress) finishProgress();

      console.log(
        `\nExtracted: ${board.nodes.length} nodes, ${board.edges.length} edges, ${board.assets.length} assets`,
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

      // Generate tldraw
      if (formats.includes("tldraw")) {
        const tldrJson = generateTldraw(board);

        if (tldrawFormat === "tldr" || tldrawFormat === "both") {
          const tldrPath = join(outputDir, `${boardBasename}.tldr`);
          await writeFile(tldrPath, tldrJson, "utf-8");
          console.log(`Written: ${tldrPath}`);
        }

        if (tldrawFormat === "obsidian" || tldrawFormat === "both") {
          const obsidianMd = wrapTldrawForObsidian(tldrJson);
          const tldrawMdPath = join(outputDir, `${boardBasename}.tldraw.md`);
          await writeFile(tldrawMdPath, obsidianMd, "utf-8");
          console.log(`Written: ${tldrawMdPath}`);
        }
      }

      console.log("\nDone!");

      // Print summary of what was not fetched / dropped
      const issues: string[] = [];
      if (stats.skippedItems.length > 0) {
        const typeCounts = new Map<string, number>();
        for (const item of stats.skippedItems) {
          typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
        }
        for (const [type, count] of typeCounts) {
          issues.push(`${count} ${type} item${count > 1 ? "s" : ""} skipped (unsupported type)`);
        }
      }
      if (stats.droppedConnectors > 0) {
        issues.push(`${stats.droppedConnectors} connector${stats.droppedConnectors > 1 ? "s" : ""} dropped (missing start/end item)`);
      }
      if (stats.filteredPreviews > 0) {
        issues.push(`${stats.filteredPreviews} preview${stats.filteredPreviews > 1 ? "s" : ""} filtered (no URL)`);
      }
      if (stats.failedAssetDownloads.length > 0) {
        issues.push(`${stats.failedAssetDownloads.length} asset download${stats.failedAssetDownloads.length > 1 ? "s" : ""} failed`);
      }
      if (stats.failedDetailFetches.length > 0) {
        issues.push(`${stats.failedDetailFetches.length} detail fetch${stats.failedDetailFetches.length > 1 ? "es" : ""} failed`);
      }
      if (issues.length > 0) {
        console.log("\nNot exported:");
        for (const issue of issues) {
          console.log(`  ⚠ ${issue}`);
        }
      }
    });

  return program;
}
