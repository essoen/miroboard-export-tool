/**
 * Maps Miro IDs to shorter, unique IDs for target formats.
 * Miro IDs are long numeric strings (e.g. "3458764553892921001").
 * Canvas IDs are typically 16-char hex strings.
 */
export class IdMap {
  private counter = 0;
  private map = new Map<string, string>();

  get(miroId: string): string {
    let targetId = this.map.get(miroId);
    if (!targetId) {
      targetId = this.counter.toString(16).padStart(16, "0");
      this.map.set(miroId, targetId);
      this.counter++;
    }
    return targetId;
  }

  has(miroId: string): boolean {
    return this.map.has(miroId);
  }
}
