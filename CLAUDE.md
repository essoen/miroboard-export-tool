# miro-migrator

CLI tool to migrate Miro boards into Obsidian Canvas (`.canvas`), Markdown notes, and tldraw (`.tldraw.md`).

## Quick Start

```bash
npx vitest run                                   # run tests (74 tests)
npx tsup                                         # build
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts <url>  # run (dev mode)
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts <url> --dry-run  # preview only
npx tsx src/index.ts <url>                        # interactive mode (prompts for token + options)
```

### Token

The CLI resolves an API token in this order:
1. `--token` flag
2. `MIRO_ACCESS_TOKEN` environment variable
3. `token` file in the current working directory (one line, trimmed)
4. Interactive prompt (if no flags/env set)

### Export to Obsidian Vault

```bash
# Non-interactive — outputs to {vault}/miro-export by default
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts <board-id-or-url> \
  --vault ~/Documents/testvault

# Interactive — asks for vault path when canvas format is selected,
# then defaults output directory inside the vault
npx tsx src/index.ts <board-id-or-url>
```

The `--vault` flag (or vault prompt in interactive mode) ensures:
- Output directory defaults to `{vault}/miro-export`
- Canvas `file` node paths are vault-relative so images resolve in Obsidian
- A `detectVaultRoot()` helper auto-detects the vault by walking up from CWD looking for `.obsidian/`
- `~` is expanded to `$HOME` in all user-supplied paths (`--vault`, `--output`, and interactive prompts)

## Architecture

```
Miro REST API v2 + v1 ──> [Extractor] ──> Intermediate Representation (IR)
                                                  │
                                      ┌───────────┼───────────┐
                                      │           │           │
                              [CanvasGen]   [MarkdownGen]  [TldrawGen]
                                      │           │           │
                                .canvas file  .md notes   .tldraw.md
```

The IR layer decouples extraction from generation. Adding new output formats (Excalidraw) requires only a new generator.

## Key Files

| File | Purpose |
|------|---------|
| `src/model/types.ts` | IR types: IRBoard, 9 node types, IREdge, IRAsset, IRColor |
| `src/model/coordinate-transform.ts` | Miro center-origin → Canvas top-left + parent-relative resolution |
| `src/model/color.ts` | Parse Miro color strings into IRColor (named + hex) |
| `src/extract/miro-extractor.ts` | Main extraction: bulk fetch → concurrent detail-fetch → coordinate resolution |
| `src/extract/image-downloader.ts` | Two-step image download (API JSON → CDN binary) |
| `src/generate/canvas/canvas-generator.ts` | IR → JSON Canvas spec (.canvas) |
| `src/generate/canvas/canvas-color-map.ts` | IRColor → Canvas color presets ("1"-"6") or hex |
| `src/generate/markdown/markdown-generator.ts` | IR → individual .md notes + board index |
| `src/generate/tldraw/tldraw-generator.ts` | IR → tldraw v2.1.4 store snapshot JSON |
| `src/generate/tldraw/tldraw-color-map.ts` | IRColor → tldraw color names |
| `src/generate/tldraw/tldraw-obsidian-wrapper.ts` | Wrap tldraw JSON in `.tldraw.md` for obsidian-tldraw plugin (v1.27.0) |
| `src/utils/progress.ts` | Progress bar (spinner for streaming, bar for determinate phases) |
| `src/utils/rate-limiter.ts` | Token bucket rate limiter (800 req/min) |
| `src/utils/html-to-markdown.ts` | Convert Miro HTML content to Markdown |
| `src/utils/id-map.ts` | Deterministic short ID generation for Canvas/tldraw |
| `src/cli.ts` | Commander CLI with interactive mode, --vault support, vault auto-detection |
| `src/index.ts` | Entry point |

## Extraction Pipeline

The extractor runs in 4 phases:

1. **Fetch items** (streaming) — `board.getAllItems()` from Miro v2 API. Returns position, geometry, content but NO style data.
2. **Fetch details** (concurrent, batches of 10) — Per-item detail calls for style and URL data:
   - **sticky_note/text/shape**: v2 typed endpoints (`_api.getStickyNoteItem`, `getTextItem`, `getShapeItem`) return `style.fillColor`, fontSize, borderColor etc.
   - **preview**: v1 REST API (`/v1/boards/{id}/widgets/{id}`) returns `url` and `title`. The v2 API returns `isSupported: false` for preview items.
   - Empty preview items (no URL even after detail fetch) are filtered out.
3. **Fetch connectors** (streaming) — `board.getAllConnectors()` from v2 API.
4. **Download assets** (concurrent, batches of 5) — Two-step: API URL → JSON with CDN URL → binary download. Supports PNG, JPG, SVG, GIF, WebP, PDF, BMP, TIFF.

All concurrent work uses `batchProcess()` with `Promise.allSettled` and respects the shared rate limiter.

### Coordinate Transform
- Miro: center-origin (0,0 = board center, position = item center)
- Canvas: top-left origin (position = item top-left corner)
- Items inside frames have `relativeTo: "parent_top_left"` — resolved to absolute board coordinates
- All coordinates normalized to positive space with margin

### Miro API Quirks
- Bulk `getAllItems()` returns items WITHOUT `style` field — must detail-fetch for colors
- Preview items return `isSupported: false` from all v2 endpoints — must use v1 API for URL
- Image resource URLs return JSON with signed CDN URL (not the image) — must two-step fetch
- Text items from bulk have no `geometry.height` — only width

## Type Mapping (Miro → Canvas)

| Miro Type | Canvas Type | Notes |
|-----------|------------|-------|
| sticky_note | `text` | With color preset from fillColor |
| shape | `text` | With color, border info stored in IR |
| text | `text` | With fontSize, fontFamily from detail |
| frame | `group` | Label preserved, children by coordinates |
| image | `file` | Two-step download, vault-relative path |
| card | `text` | Title + description as markdown |
| embed | `link` | URL preserved (YouTube etc) |
| document | `file` | PDF download, vault-relative path |
| preview | `link` | URL from v1 API, or filtered out if none |

## tldraw Generator

Generates tldraw store snapshots compatible with the **obsidian-tldraw plugin v1.27.0** (bundled tldraw v3.15.3).

Key design decisions:
- Schema baseline: **v2.1.4** sequences (the plugin auto-migrates from this baseline)
- Uses `text: string` on shapes (NOT `richText` which was added in tldraw v4.0.0)
- Arrows use inline binding terminals (`start: { type: "binding", ... }`) — no separate binding records
- Wrapper format: `.tldraw.md` with `plugin-version: "1.27.0"`, `tldraw-version: "3.15.3"`, tab-indented JSON
- `--tldraw-format` flag: `tldr` (standalone), `obsidian` (wrapped .tldraw.md), or `both` (default)
- `useLocalAssets` option: `true` for obsidian (references local `assets/` files), `false` for standalone (embeds Miro URLs)

## Interactive Mode

When run without flags or env token, the CLI enters interactive mode with this prompt order:

1. **Token** — from env / token file / prompt
2. **Formats** — canvas, markdown, tldraw, or all
3. **tldraw sub-format** — if tldraw selected: tldr, obsidian, or both
4. **Vault path** — if canvas selected: auto-detects `.obsidian/` from CWD as default
5. **Output directory** — defaults to `{vault}/miro-export` when vault is set, otherwise `./miro-export`
6. **Download images** — Y/n
7. **Dry run** — y/N
8. **Verbose** — y/N

## Not Yet Implemented

### Output Formats
- **Excalidraw generator**: IR → `.excalidraw.md` with LZ-string compressed JSON for Excalidraw Obsidian plugin.

### Extraction Improvements
- **app_card type**: Not implemented (0 on current test board, but may exist on other boards)
- **emoji type**: Skipped (1 on test board) — could map to text node with emoji character
- **Caching**: No local cache of API responses. Re-running always re-fetches everything.

### Canvas Rendering
- **PDF inline preview**: PDFs are downloaded correctly but Obsidian Canvas may not render them inline (Obsidian limitation). The files are in the vault and accessible.
- **Shape borders**: IR stores borderColor/borderWidth/borderStyle but Canvas spec doesn't support borders on text nodes. Only color is preserved.
- **Text node sizing**: Some text nodes may have auto-calculated height from Miro that differs from Canvas rendering.

### Quality of Life
- **Incremental export**: No support for re-exporting only changed items
- **Multi-board support**: CLI handles one board at a time
- **Error recovery**: Failed downloads are logged but not retried
