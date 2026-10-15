import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadStylesSync } from "./helpers/styles.mjs";

const styles = loadStylesSync();
const messages = readFileSync(new URL("../src/styles/messages.css", import.meta.url), "utf8");
const scheduled = readFileSync(new URL("../src/features/scheduled/scheduled-workspace.css", import.meta.url), "utf8");

const indicators = [
  [styles, ".working-indicator-mark > span", "working-indicator-dot"],
  [styles, ".tool-row-name.running::after", "activity-marker-pulse"],
  [styles, ".subagent-topology-node.outcome-creating .subagent-topology-status-icon", "subagent-creating-pulse"],
  [styles, ".tool-row-state.is-running .tool-row-state-dot", "tool-row-state-pulse"],
  [styles, ".tool-spinner", "spin"],
  [styles, ".assistant-turn-fragment.smooth-cursor .prose-chat > pre:last-child > code::after", "smooth-stream-blink"],
  [scheduled, ".scheduled-task-live", "scheduled-live-pulse"],
];

for (const [sheet, selector, name] of indicators) {
  test(`${name} settles without removing its status marker`, () => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = sheet.match(new RegExp(`^${escaped} \\{[^}]*\\}`, "m"))?.[0];
    assert.ok(block, `missing ${selector}`);
    assert.doesNotMatch(block, /infinite/);
    assert.match(block, /animation:[^;]*\b2;/);
    assert.doesNotMatch(block, /display:\s*none|visibility:\s*hidden/);
    // No forwards fill: completion restores the visible static marker.
    assert.doesNotMatch(block, /animation:[^;]*\b(?:forwards|both)\b/);
    assert.match(block, /background:|border:|color:/);
    assert.ok(sheet.includes(`@keyframes ${name} {`));
  });
}

test("transcript work indicators cannot introduce another endless animation", () => {
  assert.doesNotMatch(messages, /animation\s*:[^;]*\binfinite\b/);
});

test("bounded spinners and scheduled status honour reduced motion", () => {
  // The spinner fallback lives in the shared overlays partial, not messages.css.
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.tool-spinner\s*\{\s*animation: none;/);
  assert.match(scheduled, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.scheduled-task-live\s*\{\s*animation: none;/);
});
