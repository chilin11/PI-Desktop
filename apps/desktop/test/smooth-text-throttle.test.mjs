import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hook = await readFile(
  new URL("../src/hooks/useSmoothText.ts", import.meta.url),
  "utf8",
);

test("smooth text caps renderer commits at 60 Hz and stops when caught up", () => {
  assert.match(hook, /if \(elapsed < 1000 \/ 60\)/);
  assert.match(hook, /if \(backlog <= 0\) \{[\s\S]*?rafRef\.current = null;/);
  assert.match(hook, /const exactAdvance = fractionalAdvanceRef\.current \+ speed \* dt/);
});

test("streaming commits in batches by default instead of a typewriter loop", async () => {
  const [bubble, settingsPage, eventsSlice, batcher] = await Promise.all([
    readFile(new URL("../src/features/chat/transcript/AssistantTurnParts.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/settings/SettingsPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/stores/slices/events-slice.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/frame-batcher.ts", import.meta.url), "utf8"),
  ]);
  // The per-character reveal is opt-in: absent settings render chunks directly.
  assert.match(bubble, /s\.settings\?\.smoothStreaming === true/);
  assert.match(settingsPage, /checked=\{settings\.smoothStreaming === true\}/);
  assert.match(settingsPage, /saveSettings\(\{ smoothStreaming: settings\.smoothStreaming !== true \}\)/);
  // Streamed deltas reach the store at a bounded rate, not once per vsync.
  assert.match(batcher, /export const STREAM_COMMIT_INTERVAL_MS = (\d+);/);
  const interval = Number(batcher.match(/STREAM_COMMIT_INTERVAL_MS = (\d+);/)[1]);
  assert.ok(interval >= 50 && interval <= 150, `stream interval ${interval}ms stays readable`);
  assert.match(eventsSlice, /\{ minIntervalMs: STREAM_COMMIT_INTERVAL_MS \}/);
});
