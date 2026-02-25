# miro-migrator

Migrate Miro boards to Obsidian Canvas, tldraw, draw.io, and Markdown via the Miro REST API.

## Output Formats

- **Canvas** (`.canvas`) — Obsidian Canvas JSON spec
- **tldraw** (`.tldr`) — for [tldraw.com](https://tldraw.com) or any tldraw-compatible tool
- **tldraw for Obsidian** (`.tldraw.md`) — for the [tldraw-in-obsidian](https://github.com/holxsam/tldraw-in-obsidian) plugin
- **draw.io** (`.drawio`) — mxGraph XML for [draw.io / diagrams.net](https://www.diagrams.net)
- **Markdown** (`.md`) — individual notes per item + board index

## Usage

```bash
# Interactive mode — prompts for token and options
npx tsx src/index.ts https://miro.com/app/board/BOARD_ID/

# Export all formats to an Obsidian vault (outputs to ~/vault/miro-export/)
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts BOARD_ID \
  --vault ~/path/to/vault \
  --format canvas,markdown,tldraw,drawio

# Export draw.io only
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts BOARD_ID --format drawio

# Export tldraw only (.tldr for tldraw.com)
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts BOARD_ID \
  --format tldraw --tldraw-format tldr

# Dry run (no files written)
MIRO_ACCESS_TOKEN=xxx npx tsx src/index.ts BOARD_ID --dry-run
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --token <token>` | Miro access token (or `MIRO_ACCESS_TOKEN` env, or `token` file in cwd) | — |
| `-o, --output <dir>` | Output directory | `./miro-export` |
| `-f, --format <fmts>` | Comma-separated: `canvas`, `markdown`, `tldraw`, `drawio` | `canvas,markdown` |
| `--tldraw-format <fmt>` | tldraw output: `tldr`, `obsidian`, or `both` | `both` |
| `--vault <path>` | Obsidian vault root — defaults output to `{vault}/miro-export` and computes vault-relative image paths | — |
| `--no-images` | Skip image/document download | — |
| `--scale <number>` | Coordinate scale factor | `1.0` |
| `--dry-run` | Preview extraction without writing files | — |
| `--verbose` | Detailed logging | — |

Requires a Miro OAuth token with `boards:read` scope. Token is resolved in order: `--token` flag → `MIRO_ACCESS_TOKEN` env → `token` file in cwd → interactive prompt.

## Development

### Setup

```bash
git clone <repo> && cd miro-migrator
npm install
npm test          # 98 tests via vitest
npm run build     # build with tsup
```

Requires Node.js >= 20.

### Structure

```
src/
  index.ts                          # Entry point
  cli.ts                            # CLI (commander) with interactive mode
  model/
    types.ts                        # IR types (IRBoard, IRNode, IREdge, IRAsset)
    color.ts                        # Miro named colors → hex parsing
    coordinate-transform.ts         # Miro center-origin → top-left
  extract/
    miro-extractor.ts               # Bulk fetch + concurrent detail-fetch → IR
    image-downloader.ts             # Two-step image download (API → CDN)
  generate/
    canvas/
      canvas-generator.ts           # IR → .canvas (JSON Canvas spec)
      canvas-color-map.ts           # Miro colors → Canvas presets
    tldraw/
      tldraw-generator.ts           # IR → .tldr (tldraw JSON)
      tldraw-color-map.ts           # Miro colors → tldraw named colors
      tldraw-obsidian-wrapper.ts    # .tldr → .tldraw.md for Obsidian plugin
    drawio/
      drawio-generator.ts           # IR → .drawio (mxGraph XML)
      drawio-color-map.ts           # Miro colors → draw.io fill/stroke hex pairs
    markdown/
      markdown-generator.ts         # IR → .md notes + board index
  utils/
    rate-limiter.ts                 # Token bucket (800 req/min)
    progress.ts                     # CLI progress bar
    html-to-markdown.ts             # Miro HTML → Markdown
    id-map.ts                       # Miro ID → stable short ID mapping
  __tests__/                        # vitest unit tests
```

### Architecture

```
Miro REST API (v2 + v1) ──> [Extractor] ──> Intermediate Representation (IR)
                                                    │
                                  ┌─────────────────┼──────────────┬──────────────┐
                                  │                 │              │              │
                          [CanvasGenerator] [TldrawGenerator] [DrawioGenerator] [MarkdownGenerator]
                                  │                 │              │              │
                            .canvas file   .tldr/.tldraw.md    .drawio        .md notes
```

The IR layer decouples extraction from generation. Each output format has its own generator module.
