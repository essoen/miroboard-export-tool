# miro-migrator

CLI tool to migrate Miro boards into Obsidian Canvas (`.canvas`) and Markdown notes.

## Quick Start

```bash
npx vitest run                                   # run tests (43 tests)
npx tsup                                         # build
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts <url>  # run (dev mode)
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts <url> --dry-run  # preview only
npx tsx src/index.ts <url>                        # interactive mode (prompts for token + options)
```

### Export to Obsidian Vault

```bash
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts <board-id-or-url> \
  --vault ~/Documents/testvault/testvault \
  --output ~/Documents/testvault/testvault
```

The `--vault` flag computes vault-relative file paths so Canvas `file` nodes resolve correctly in Obsidian.

## Architecture

```
Miro REST API v2 + v1 ──> [Extractor] ──> Intermediate Representation (IR)
                                                  │
                                      ┌───────────┴───────────┐
                                      │                       │
                              [CanvasGenerator]      [MarkdownGenerator]
                                      │                       │
                                .canvas file            .md notes + index
```

The IR layer decouples extraction from generation. Adding new output formats (tldraw, Excalidraw) requires only a new generator.

## Key Files

| File | Purpose |
|------|---------|
| `src/model/types.ts` | IR types: IRBoard, 9 node types, IREdge, IRAsset, IRColor |
| `src/model/coordinate-transform.ts` | Miro center-origin → Canvas top-left + parent-relative resolution |
| `src/model/color-map.ts` | Miro named colors → Canvas presets ("1"-"6") or hex |
| `src/extract/miro-extractor.ts` | Main extraction: bulk fetch → detail-fetch → coordinate resolution |
| `src/extract/image-downloader.ts` | Two-step image download (API JSON → CDN binary) |
| `src/generate/canvas-generator.ts` | IR → JSON Canvas spec (.canvas) |
| `src/generate/markdown-generator.ts` | IR → individual .md notes + board index |
| `src/utils/progress.ts` | Progress bar (spinner for streaming, bar for determinate phases) |
| `src/utils/rate-limiter.ts` | Token bucket rate limiter (800 req/min) |
| `src/cli.ts` | Commander CLI with interactive mode and --vault support |
| `src/index.ts` | Entry point |

## Extraction Pipeline

The extractor runs in 4 phases:

1. **Fetch items** (streaming) — `board.getAllItems()` from Miro v2 API. Returns position, geometry, content but NO style data.
2. **Fetch details** (determinate) — Per-item detail calls for style and URL data:
   - **sticky_note/text/shape**: v2 typed endpoints (`_api.getStickyNoteItem`, `getTextItem`, `getShapeItem`) return `style.fillColor`, fontSize, borderColor etc.
   - **preview**: v1 REST API (`/v1/boards/{id}/widgets/{id}`) returns `url` and `title`. The v2 API returns `isSupported: false` for preview items.
   - Empty preview items (no URL even after detail fetch) are filtered out.
3. **Fetch connectors** (streaming) — `board.getAllConnectors()` from v2 API.
4. **Download assets** (determinate) — Two-step: API URL → JSON with CDN URL → binary download. Supports PNG, JPG, SVG, GIF, WebP, PDF, BMP, TIFF.

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

## Not Yet Implemented

### Output Formats
- **tldraw generator** (Phase 5): IR → tldraw store snapshot → `.md` with embedded `.tldr` for tldraw-in-obsidian plugin. Needs `@tldraw/tlschema` + `@tldraw/store`.
- **Excalidraw generator** (Phase 6): IR → `.excalidraw.md` with LZ-string compressed JSON for Excalidraw Obsidian plugin.

### Extraction Improvements
- **app_card type**: Not implemented (0 on current test board, but may exist on other boards)
- **emoji type**: Skipped (1 on test board) — could map to text node with emoji character
- **Concurrent detail-fetch**: Currently sequential. Could batch with Promise.allSettled for faster extraction.
- **Caching**: No local cache of API responses. Re-running always re-fetches everything.

### Canvas Rendering
- **PDF inline preview**: PDFs are downloaded correctly but Obsidian Canvas may not render them inline (Obsidian limitation). The files are in the vault and accessible.
- **Shape borders**: IR stores borderColor/borderWidth/borderStyle but Canvas spec doesn't support borders on text nodes. Only color is preserved.
- **Text node sizing**: Some text nodes may have auto-calculated height from Miro that differs from Canvas rendering.

### Quality of Life
- **Incremental export**: No support for re-exporting only changed items
- **Multi-board support**: CLI handles one board at a time
- **Error recovery**: Failed downloads are logged but not retried
