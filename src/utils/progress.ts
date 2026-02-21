import type { ProgressEvent } from "../extract/miro-extractor.js";

const BAR_WIDTH = 30;

const PHASE_LABELS: Record<string, string> = {
  items: "Fetching items",
  connectors: "Fetching connectors",
  details: "Fetching details",
  assets: "Downloading assets",
};

/**
 * Creates a progress handler that renders an inline progress bar to stderr.
 * Uses ANSI escape codes to overwrite the current line.
 */
export function createProgressHandler(): (event: ProgressEvent) => void {
  let lastPhase = "";

  return (event: ProgressEvent) => {
    const { phase, current, total } = event;

    // Print newline when phase changes
    if (phase !== lastPhase) {
      if (lastPhase) process.stderr.write("\n");
      lastPhase = phase;
    }

    const label = PHASE_LABELS[phase] || phase;

    if (total != null && total > 0) {
      // Determinate progress (assets download)
      const ratio = Math.min(current / total, 1);
      const filled = Math.round(ratio * BAR_WIDTH);
      const empty = BAR_WIDTH - filled;
      const bar = "█".repeat(filled) + "░".repeat(empty);
      const pct = Math.round(ratio * 100);
      process.stderr.write(`\r  ${label}  ${bar}  ${pct}% (${current}/${total})`);
    } else {
      // Indeterminate progress (items/connectors — count unknown)
      // Show a spinner with count
      const spinChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
      const spinner = spinChars[current % spinChars.length];
      process.stderr.write(`\r  ${label}  ${spinner}  ${current} fetched`);
    }
  };
}

/**
 * Finalize progress output — print newline after last bar.
 */
export function finishProgress(): void {
  process.stderr.write("\n");
}
