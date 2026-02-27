import { describe, it, expect, vi } from "vitest";
import { batchProcess } from "../extract/miro-extractor.js";

describe("batchProcess", () => {
  it("processes all items", async () => {
    const items = [1, 2, 3, 4, 5];
    const results: number[] = [];

    await batchProcess(items, 2, async (item) => {
      results.push(item);
    });

    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it("respects concurrency limit", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const items = [1, 2, 3, 4, 5, 6];
    await batchProcess(items, 3, async (_item) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      // Simulate async work
      await new Promise((r) => setTimeout(r, 10));
      currentConcurrent--;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("continues processing when individual items throw", async () => {
    const items = [1, 2, 3, 4];
    const processed: number[] = [];

    await batchProcess(items, 2, async (item) => {
      if (item === 2) throw new Error("fail");
      processed.push(item);
    });

    // Items 1, 3, 4 should still be processed (2 threw but allSettled continues)
    expect(processed).toContain(1);
    expect(processed).toContain(3);
    expect(processed).toContain(4);
    expect(processed).not.toContain(2);
  });

  it("handles empty array", async () => {
    const fn = vi.fn();
    await batchProcess([], 5, fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it("handles batch size larger than items", async () => {
    const items = [1, 2];
    const results: number[] = [];

    await batchProcess(items, 10, async (item) => {
      results.push(item);
    });

    expect(results).toEqual([1, 2]);
  });

  it("processes batches sequentially", async () => {
    const order: string[] = [];
    const items = [1, 2, 3, 4];

    await batchProcess(items, 2, async (item) => {
      order.push(`start-${item}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`end-${item}`);
    });

    // Batch 1 (items 1,2) should complete before batch 2 (items 3,4) starts
    const startOf3 = order.indexOf("start-3");
    const endOf1 = order.indexOf("end-1");
    const endOf2 = order.indexOf("end-2");

    expect(startOf3).toBeGreaterThan(endOf1);
    expect(startOf3).toBeGreaterThan(endOf2);
  });
});
