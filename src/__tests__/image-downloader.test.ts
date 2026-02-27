import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  extFromContentType,
  extFromUrl,
  isTransient,
  fetchWithTimeout,
  fetchWithRetry,
  downloadImage,
} from "../extract/image-downloader.js";

// --- Unit tests for helper functions ---

describe("extFromContentType", () => {
  it("maps common image content types", () => {
    expect(extFromContentType("image/jpeg")).toBe(".jpg");
    expect(extFromContentType("image/jpg")).toBe(".jpg");
    expect(extFromContentType("image/png")).toBe(".png");
    expect(extFromContentType("image/svg+xml")).toBe(".svg");
    expect(extFromContentType("image/gif")).toBe(".gif");
    expect(extFromContentType("image/webp")).toBe(".webp");
    expect(extFromContentType("application/pdf")).toBe(".pdf");
    expect(extFromContentType("image/bmp")).toBe(".bmp");
    expect(extFromContentType("image/tiff")).toBe(".tiff");
  });

  it("returns null for unknown content types", () => {
    expect(extFromContentType("text/html")).toBeNull();
    expect(extFromContentType("application/json")).toBeNull();
    expect(extFromContentType("")).toBeNull();
  });
});

describe("extFromUrl", () => {
  it("extracts extension from URL path", () => {
    expect(extFromUrl("https://cdn.miro.com/images/preview.png")).toBe(".png");
    expect(extFromUrl("https://cdn.miro.com/doc.pdf")).toBe(".pdf");
    expect(extFromUrl("https://example.com/photo.jpg")).toBe(".jpg");
  });

  it("ignores query parameters", () => {
    expect(
      extFromUrl("https://cdn.miro.com/img.png?Expires=12345&Signature=abc"),
    ).toBe(".png");
  });

  it("returns null when no extension", () => {
    expect(extFromUrl("https://cdn.miro.com/resource/123")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(extFromUrl("not a url")).toBeNull();
  });
});

describe("isTransient", () => {
  it("treats 429, 500, 502, 503, 504 as transient", () => {
    expect(isTransient(429)).toBe(true);
    expect(isTransient(500)).toBe(true);
    expect(isTransient(502)).toBe(true);
    expect(isTransient(503)).toBe(true);
    expect(isTransient(504)).toBe(true);
  });

  it("treats other status codes as non-transient", () => {
    expect(isTransient(200)).toBe(false);
    expect(isTransient(400)).toBe(false);
    expect(isTransient(401)).toBe(false);
    expect(isTransient(403)).toBe(false);
    expect(isTransient(404)).toBe(false);
  });
});

// --- Tests for fetch wrappers ---

describe("fetchWithTimeout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns response when fetch completes within timeout", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithTimeout("https://example.com", {}, 5000);
    expect(result.status).toBe(200);
  });

  it("throws timeout error when fetch exceeds timeout", async () => {
    vi.mocked(fetch).mockImplementationOnce(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          // Simulate AbortController triggering
          const signal = (opts as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              const err = new Error("The operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }
        }),
    );

    await expect(fetchWithTimeout("https://example.com", {}, 50)).rejects.toThrow(
      "Request timed out after 50ms",
    );
  });

  it("passes abort signal to fetch", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    await fetchWithTimeout("https://example.com");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns response on first successful attempt", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("https://example.com", {}, 3);
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const result = await fetchWithRetry("https://example.com", {}, 3);
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 and succeeds", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const result = await fetchWithRetry("https://example.com", {}, 3);
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on transient errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(
      fetchWithRetry("https://example.com", {}, 2),
    ).rejects.toThrow("HTTP 503");
    expect(fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not found", { status: 404 }),
    );

    await expect(
      fetchWithRetry("https://example.com", {}, 3),
    ).rejects.toThrow("HTTP 404");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("unauthorized", { status: 401 }),
    );

    await expect(
      fetchWithRetry("https://example.com", {}, 3),
    ).rejects.toThrow("HTTP 401");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// --- Tests for downloadImage ---

const { mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockWriteFile: vi.fn().mockResolvedValue(undefined),
  mockMkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: (...args: any[]) => mockWriteFile(...args),
  mkdir: (...args: any[]) => mockMkdir(...args),
}));

describe("downloadImage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockWriteFile.mockClear();
    mockMkdir.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles two-step download (API JSON → CDN binary)", async () => {
    // Step 1: API returns JSON with CDN URL
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ url: "https://cdn.miro.com/img.png" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    // Step 2: CDN returns binary
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const result = await downloadImage(
      "https://api.miro.com/v2/boards/123/resources/images/456",
      "/tmp/output",
      "img_1",
      "test-token",
    );

    expect(result).toBe("assets/img_1.png");
    expect(fetch).toHaveBeenCalledTimes(2);

    // Verify auth header on API call
    const firstCallArgs = vi.mocked(fetch).mock.calls[0];
    expect(firstCallArgs[1]).toMatchObject({
      headers: { Authorization: "Bearer test-token" },
    });

    // Verify no auth header on CDN call
    const secondCallArgs = vi.mocked(fetch).mock.calls[1];
    expect((secondCallArgs[1] as any)?.headers?.Authorization).toBeUndefined();

    // Verify file was written
    expect(mockWriteFile).toHaveBeenCalledWith(
      join("/tmp/output", "assets", "img_1.png"),
      expect.any(Buffer),
    );
  });

  it("handles direct binary response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from([0xff, 0xd8, 0xff]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );

    const result = await downloadImage(
      "https://example.com/image.jpg",
      "/tmp/output",
      "img_2",
    );

    expect(result).toBe("assets/img_2.jpg");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when API returns JSON without URL field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ type: "image" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      downloadImage(
        "https://api.miro.com/v2/boards/123/resources/images/456",
        "/tmp/output",
        "img_3",
        "token",
      ),
    ).rejects.toThrow("JSON without a URL field");
  });

  it("prepends pathPrefix when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const result = await downloadImage(
      "https://example.com/img.png",
      "/tmp/output",
      "img_4",
      undefined,
      "miro-export/",
    );

    expect(result).toBe("miro-export/assets/img_4.png");
  });

  it("falls back to .png when content type is unknown", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from([0x00]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    const result = await downloadImage(
      "https://example.com/resource/123",
      "/tmp/output",
      "img_5",
    );

    expect(result).toBe("assets/img_5.png");
  });

  it("resolves extension from CDN URL when content type is unknown", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: "https://cdn.miro.com/file.svg" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from("<svg></svg>"), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
      );

    const result = await downloadImage(
      "https://api.miro.com/resource",
      "/tmp/output",
      "img_6",
      "token",
    );

    expect(result).toBe("assets/img_6.svg");
  });

  it("creates assets directory", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(Buffer.from([0x89]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    await downloadImage(
      "https://example.com/img.png",
      "/tmp/output",
      "img_7",
    );

    expect(mockMkdir).toHaveBeenCalledWith(
      join("/tmp/output", "assets"),
      { recursive: true },
    );
  });
});
