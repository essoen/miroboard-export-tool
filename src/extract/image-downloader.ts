import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Determine file extension from content-type header.
 */
function extFromContentType(contentType: string): string | null {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("svg")) return ".svg";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("pdf")) return ".pdf";
  if (contentType.includes("bmp")) return ".bmp";
  if (contentType.includes("tiff")) return ".tiff";
  return null;
}

/**
 * Extract file extension from a URL path (ignoring query params).
 * e.g. "https://r.miro.com/.../preview.png?Expires=..." → ".png"
 */
function extFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(\w{2,5})$/);
    if (match) return `.${match[1]}`;
  } catch {
    // Invalid URL, ignore
  }
  return null;
}

/**
 * Download an image or document from a Miro API URL and save it locally.
 *
 * Miro API resource URLs (with redirect=false) return JSON containing a signed CDN URL.
 * This function handles the two-step flow:
 *   1. Fetch the API URL with auth → get JSON with CDN URL
 *   2. Fetch the CDN URL (pre-signed, no auth) → get the actual binary
 *
 * Returns the relative path within the output directory.
 */
export async function downloadImage(
  url: string,
  outputDir: string,
  assetId: string,
  authToken?: string,
  pathPrefix?: string,
): Promise<string> {
  const assetsDir = join(outputDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  // Step 1: Fetch the Miro API URL
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  let imageBuffer: Buffer;
  let resolvedContentType: string;
  let cdnUrl: string | null = null;

  if (contentType.includes("application/json")) {
    // Miro API returned JSON with a signed CDN URL — need a second fetch
    const json = await response.json() as { url?: string; type?: string };
    cdnUrl = json.url;
    if (!cdnUrl) {
      throw new Error(`Miro API returned JSON without a URL field for asset ${assetId}`);
    }

    // Step 2: Fetch the actual binary from the CDN (no auth needed)
    const cdnResponse = await fetch(cdnUrl);
    if (!cdnResponse.ok) {
      throw new Error(`Failed to download CDN URL ${cdnUrl}: ${cdnResponse.status} ${cdnResponse.statusText}`);
    }

    imageBuffer = Buffer.from(await cdnResponse.arrayBuffer());
    resolvedContentType = cdnResponse.headers.get("content-type") || "";
  } else {
    // Direct binary response (future-proofing if Miro changes behavior)
    imageBuffer = Buffer.from(await response.arrayBuffer());
    resolvedContentType = contentType;
  }

  // Determine extension: prefer content-type, fall back to CDN URL extension, then .png
  const ext =
    extFromContentType(resolvedContentType) ||
    (cdnUrl ? extFromUrl(cdnUrl) : null) ||
    extFromUrl(url) ||
    ".png";

  const filename = `${assetId}${ext}`;
  const filePath = join(assetsDir, filename);

  await writeFile(filePath, imageBuffer);

  // Return path for use in .canvas file references
  // If pathPrefix is set (vault-relative mode), prepend it
  const relativePath = `assets/${filename}`;
  return pathPrefix ? `${pathPrefix}${relativePath}` : relativePath;
}
