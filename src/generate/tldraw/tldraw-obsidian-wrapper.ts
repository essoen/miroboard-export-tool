import { randomUUID } from "node:crypto";

/**
 * Wrap a .tldr JSON string in the markdown format expected by
 * the tldraw-in-obsidian plugin.
 *
 * The plugin expects:
 * - Frontmatter with `tldraw-file: true`
 * - Data between delimiter phrases
 * - JSON code block containing { meta, raw } wrapper
 */
export function wrapTldrawForObsidian(tldrJson: string): string {
  const uuid = randomUUID();
  const wrapper = {
    meta: {
      "plugin-version": "3.0.0",
      "tldraw-version": "3.0.0",
      uuid,
    },
    raw: JSON.parse(tldrJson),
  };

  const lines = [
    "---",
    "tldraw-file: true",
    "---",
    "",
    "!!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!",
    "```json",
    JSON.stringify(wrapper, null, 2),
    "```",
    "!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!",
    "",
  ];
  return lines.join("\n");
}
