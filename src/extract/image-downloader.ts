import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

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
 * Check if an error is transient and worth retrying.
 */
function isTransient(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Fetch with a timeout. Throws if the request takes longer than `timeoutMs`.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with retry and exponential backoff for transient errors.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      if (response.ok) return response;

      if (isTransient(response.status) && attempt < maxRetries) {
        // Respect Retry-After header for 429s; use longer backoff for rate limits
        const retryAfter = response.headers.get("retry-after");
        let backoff: number;
        if (retryAfter) {
          const parsed = Number(retryAfter);
          backoff = isNaN(parsed) ? INITIAL_BACKOFF_MS * Math.pow(2, attempt) : parsed * 1000;
        } else if (response.status === 429) {
          // 429 without Retry-After: use longer backoff (2s, 4s, 8s, 16s)
          backoff = 2000 * Math.pow(2, attempt);
        } else {
          backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        }
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Retry on network errors and timeouts (not HTTP errors, those are handled above)
      if (err.message?.includes("timed out") && attempt < maxRetries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (attempt === maxRetries) break;
      // Network-level errors (ECONNRESET, ECONNREFUSED, etc.) — retry
      if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.code === "EPIPE" || err.cause) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      break; // Non-transient error, don't retry
    }
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

/**
 * Download an image or document from a Miro API URL and save it locally.
 *
 * Miro API resource URLs (with redirect=false) return JSON containing a signed CDN URL.
 * This function handles the two-step flow:
 *   1. Fetch the API URL with auth → get JSON with CDN URL
 *   2. Fetch the CDN URL (pre-signed, no auth) → get the actual binary
 *
 * Both steps use retry with exponential backoff and a 30s timeout.
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
  const response = await fetchWithRetry(url, { headers });

  const contentType = response.headers.get("content-type") || "";

  let imageBuffer: Buffer;
  let resolvedContentType: string;
  let cdnUrl: string | null = null;

  if (contentType.includes("application/json")) {
    // Miro API returned JSON with a signed CDN URL — need a second fetch
    const json = await response.json() as { url?: string; type?: string };
    cdnUrl = json.url ?? null;
    if (!cdnUrl) {
      throw new Error(`Miro API returned JSON without a URL field for asset ${assetId}`);
    }

    // Step 2: Fetch the actual binary from the CDN (no auth needed)
    const cdnResponse = await fetchWithRetry(cdnUrl);

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

// Exported for testing
export { extFromContentType, extFromUrl, isTransient, fetchWithTimeout, fetchWithRetry };
