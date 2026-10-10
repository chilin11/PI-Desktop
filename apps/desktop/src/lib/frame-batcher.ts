type FrameHandle = number;

/**
 * How often streamed message/tool deltas may commit to the renderer store.
 * ~10 commits per second reads as continuous text while keeping layout,
 * Markdown parsing and rasterization off the per-frame path.
 */
export const STREAM_COMMIT_INTERVAL_MS = 100;

export interface FrameBatcherOptions {
  /**
   * Minimum time between two scheduled flushes. `0` (default) flushes at the
   * next paint opportunity. A positive value bounds how often a stream can
   * commit to React, so token streams repaint at a steady low rate instead of
   * every display refresh.
   */
  minIntervalMs?: number;
  /** Clock override for tests. */
  now?: () => number;
}

/**
 * Coalesces high-frequency updates until the next flush opportunity.
 *
 * A key keeps only the latest value for one streaming target while preserving
 * insertion order between different targets. Terminal events can call
 * flushNow() so a final state never waits behind the interval or the frame.
 */
export function createFrameBatcher<T>(
  flush: (values: readonly T[]) => void,
  options: FrameBatcherOptions = {},
) {
  const minIntervalMs = Math.max(0, options.minIntervalMs ?? 0);
  const now = options.now ?? (() => Date.now());
  const pending = new Map<string, T>();
  let handle: FrameHandle | null = null;
  let usesAnimationFrame = false;
  let lastFlushAt = Number.NEGATIVE_INFINITY;

  const cancelScheduledFlush = () => {
    if (handle === null) return;
    if (
      usesAnimationFrame &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(handle);
    } else {
      globalThis.clearTimeout(handle);
    }
    handle = null;
  };

  const run = () => {
    handle = null;
    if (pending.size === 0) return;
    lastFlushAt = now();
    const values = [...pending.values()];
    pending.clear();
    flush(values);
  };

  const schedule = () => {
    if (handle !== null) return;
    const wait = minIntervalMs > 0 ? lastFlushAt + minIntervalMs - now() : 0;
    if (wait > 0) {
      usesAnimationFrame = false;
      handle = globalThis.setTimeout(run, wait) as unknown as FrameHandle;
      return;
    }
    if (typeof globalThis.requestAnimationFrame === "function") {
      usesAnimationFrame = true;
      handle = globalThis.requestAnimationFrame(run);
      return;
    }
    usesAnimationFrame = false;
    handle = globalThis.setTimeout(run, 16) as unknown as FrameHandle;
  };

  return {
    enqueue(key: string, value: T, merge?: (previous: T, next: T) => T) {
      const existing = pending.get(key);
      pending.set(key, existing && merge ? merge(existing, value) : value);
      schedule();
    },
    flushNow() {
      cancelScheduledFlush();
      run();
    },
    get size() {
      return pending.size;
    },
  };
}
