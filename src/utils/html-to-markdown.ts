/**
 * Simple HTML-to-Markdown converter for Miro content.
 * Miro stores text as HTML (e.g. <p>text</p>, <strong>, <em>, <a>, <br>).
 * We don't need a full HTML parser - Miro's HTML is limited.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";

  let md = html;

  // Replace <br> and <br/> with newlines
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Replace <p>...</p> with content + double newline
  md = md.replace(/<p>(.*?)<\/p>/gi, "$1\n\n");

  // Bold
  md = md.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>(.*?)<\/b>/gi, "**$1**");

  // Italic
  md = md.replace(/<em>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>(.*?)<\/i>/gi, "*$1*");

  // Links
  md = md.replace(/<a\s+href="(.*?)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Lists
  md = md.replace(/<li>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<\/?[ou]l>/gi, "\n");

  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode basic HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");
  md = md.replace(/&nbsp;/g, " ");

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}
