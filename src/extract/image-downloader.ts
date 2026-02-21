import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Download an image from a URL and save it locally.
 * Returns the relative path within the output directory.
 */
export async function downloadImage(
  url: string,
  outputDir: string,
  assetId: string,
  authToken?: string,
): Promise<string> {
  const assetsDir = join(outputDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  // Determine file extension from content-type
  const contentType = response.headers.get("content-type") || "image/png";
  const ext = contentType.includes("jpeg") || contentType.includes("jpg")
    ? ".jpg"
    : contentType.includes("svg")
      ? ".svg"
      : contentType.includes("gif")
        ? ".gif"
        : contentType.includes("webp")
          ? ".webp"
          : ".png";

  const filename = `${assetId}${ext}`;
  const filePath = join(assetsDir, filename);

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);

  // Return path relative to output dir (for use in .canvas file references)
  return `assets/${filename}`;
}
