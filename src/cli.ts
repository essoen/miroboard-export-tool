import { Command } from "commander";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, relative, resolve, dirname, parse } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { extractBoard } from "./extract/miro-extractor.js";
import { generateCanvas } from "./generate/canvas/canvas-generator.js";
import { generateMarkdown } from "./generate/markdown/markdown-generator.js";
import { generateTldraw } from "./generate/tldraw/tldraw-generator.js";
import { wrapTldrawForObsidian } from "./generate/tldraw/tldraw-obsidian-wrapper.js";
import { generateDrawio } from "./generate/drawio/drawio-generator.js";
import { createProgressHandler, finishProgress } from "./utils/progress.js";

function expandHome(p: string): string {
  return p.startsWith("~/") || p === "~" ? homedir() + p.slice(1) : p;
}

/**
 * Read Miro token from a `token` file in cwd, if it exists.
 * Returns the trimmed contents or undefined.
 */
async function readTokenFile(): Promise<string | undefined> {
  const tokenPath = join(process.cwd(), "token");
  if (!existsSync(tokenPath)) return undefined;
  const content = (await readFile(tokenPath, "utf-8")).trim();
  return content || undefined;
}

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
 * Walk up from a directory looking for an `.obsidian/` folder.
 * Returns the vault root path if found, or undefined.
 */
function detectVaultRoot(fromDir: string): string | undefined {
  let dir = resolve(fromDir);
  const root = parse(dir).root;
  while (dir !== root) {
    if (existsSync(join(dir, ".obsidian"))) return dir;
    dir = dirname(dir);
  }
  return undefined;
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
  vaultRoot?: string;
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
    const fileToken = !envToken ? await readTokenFile() : undefined;
    let token = envToken || fileToken || "";
    if (!envToken && !fileToken) {
      token = await rl.question("  Miro access token: ");
      if (!token.trim()) {
        console.error("  Error: Token is required.");
        process.exit(1);
      }
    } else if (fileToken && !envToken) {
      console.log("  Token: using token file");
    } else {
      console.log("  Token: using MIRO_ACCESS_TOKEN from env");
    }

    // Formats
    const formatAnswer = await rl.question("  Formats — canvas, markdown, tldraw, drawio, or all [canvas,markdown]: ");
    let formats: string[];
    const fmt = formatAnswer.trim().toLowerCase();
    if (fmt === "canvas") {
      formats = ["canvas"];
    } else if (fmt === "markdown") {
      formats = ["markdown"];
    } else if (fmt === "tldraw") {
      formats = ["tldraw"];
    } else if (fmt === "drawio") {
      formats = ["drawio"];
    } else if (fmt === "all") {
      formats = ["canvas", "markdown", "tldraw", "drawio"];
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

    // Vault path (for canvas — files must be inside vault for Obsidian to resolve them)
    let vaultRoot: string | undefined;
    if (formats.includes("canvas")) {
      const detected = detectVaultRoot(resolve("."));
      const defaultHint = detected ? ` [${detected}]` : "";
      const vaultAnswer = await rl.question(`  Obsidian vault path${defaultHint}: `);
      const trimmed = vaultAnswer.trim();
      if (trimmed) {
        vaultRoot = expandHome(trimmed);
      } else if (detected) {
        vaultRoot = detected;
      }
    }

    // Output directory — default inside vault when vault is specified
    const defaultOutput = vaultRoot ? join(vaultRoot, "miro-export") : "./miro-export";
    const outputAnswer = await rl.question(`  Output directory [${defaultOutput}]: `);
    const outputDir = expandHome(outputAnswer.trim() || defaultOutput);

    // Validate output is inside vault when vault is specified
    if (vaultRoot) {
      const absOutput = resolve(outputDir);
      const absVault = resolve(vaultRoot);
      if (!absOutput.startsWith(absVault)) {
        console.warn(`\n  ⚠ Warning: Output directory is outside the vault.`);
        console.warn(`    Obsidian Canvas can only reference files inside the vault.`);
        console.warn(`    Vault:  ${absVault}`);
        console.warn(`    Output: ${absOutput}\n`);
      }
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
    return { token: token.trim(), outputDir, formats, downloadImages, dryRun, verbose, tldrawFormat, vaultRoot };
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
      "Output formats (comma-separated: canvas,markdown,tldraw,drawio)",
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
      let vaultRoot: string | undefined;

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
        vaultRoot = prompted.vaultRoot;
      } else {
        // Options provided via flags / env / token file — use them directly
        const fileToken = await readTokenFile();
        token = options.token || process.env.MIRO_ACCESS_TOKEN || fileToken;
        if (!token) {
          console.error(
            "Error: Miro access token required. Use --token, set MIRO_ACCESS_TOKEN, or put it in a 'token' file.",
          );
          process.exit(1);
        }
        formats = (options.format as string).split(",").map((f: string) => f.trim());
        vaultRoot = options.vault ? expandHome(options.vault) : undefined;
        // When --vault is set: use --output if explicitly changed, otherwise default to {vault}/miro-export
        if (vaultRoot && options.output === "./miro-export") {
          outputDir = join(vaultRoot, "miro-export");
        } else {
          outputDir = expandHome(options.output);
        }
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

      // Compute vault-relative asset path prefix.
      // Obsidian Canvas "file" paths are resolved from the vault root.
      // If output is ~/vault/miro-export/ and vault is ~/vault/,
      // then prefix is "miro-export/" so file paths become "miro-export/assets/img.png".
      // If output == vault root, no prefix needed — "assets/img.png" resolves directly.
      let assetPathPrefix: string | undefined;
      if (vaultRoot && !dryRun) {
        const absOutput = resolve(outputDir);
        const absVault = resolve(vaultRoot);
        const rel = relative(absVault, absOutput);
        if (rel.startsWith("..")) {
          console.warn(`⚠ Output is outside vault — canvas image paths may not resolve in Obsidian.`);
        } else if (rel) {
          // Output is a subdirectory of vault — prefix with the relative path
          assetPathPrefix = rel + "/";
        }
        // If rel is empty (vault == output), no prefix needed
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
        if (tldrawFormat === "tldr" || tldrawFormat === "both") {
          const tldrJson = generateTldraw(board, { useLocalAssets: false });
          const tldrPath = join(outputDir, `${boardBasename}.tldr`);
          await writeFile(tldrPath, tldrJson, "utf-8");
          console.log(`Written: ${tldrPath}`);
        }

        if (tldrawFormat === "obsidian" || tldrawFormat === "both") {
          const tldrJson = generateTldraw(board, { useLocalAssets: true });
          const obsidianMd = wrapTldrawForObsidian(tldrJson);
          const tldrawMdPath = join(outputDir, `${boardBasename}.tldraw.md`);
          await writeFile(tldrawMdPath, obsidianMd, "utf-8");
          console.log(`Written: ${tldrawMdPath}`);
        }
      }

      // Generate draw.io
      if (formats.includes("drawio")) {
        const drawioXml = generateDrawio(board);
        const drawioPath = join(outputDir, `${boardBasename}.drawio`);
        await writeFile(drawioPath, drawioXml, "utf-8");
        console.log(`Written: ${drawioPath}`);
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
