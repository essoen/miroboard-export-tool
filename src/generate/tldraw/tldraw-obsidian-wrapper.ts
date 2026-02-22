import { randomUUID } from "node:crypto";

/**
 * Wrap a .tldr JSON string in the markdown format expected by
 * the tldraw-in-obsidian plugin (tldraw/obsidian-plugin).
 *
 * The plugin expects:
 * - Frontmatter with `tldraw-file: true`
 * - Start delimiter on the SAME line as the ```json fence
 * - JSON code block containing { meta, raw } wrapper (tab-indented)
 * - End delimiter before the closing ``` fence
 *
 * @see https://github.com/tldraw/obsidian-plugin
 */
export function wrapTldrawForObsidian(tldrJson: string): string {
  const uuid = randomUUID();
  const wrapper = {
    meta: {
      uuid,
      "plugin-version": "1.27.0",
      "tldraw-version": "3.15.3",
    },
    raw: JSON.parse(tldrJson),
  };

  const lines = [
    "---",
    "tldraw-file: true",
    "---",
    "",
    "```json !!!_START_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!",
    JSON.stringify(wrapper, null, "\t"),
    "!!!_END_OF_TLDRAW_DATA__DO_NOT_CHANGE_THIS_PHRASE_!!!",
    "```",
    "",
  ];
  return lines.join("\n");
}
