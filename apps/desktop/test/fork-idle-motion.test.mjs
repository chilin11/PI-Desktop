import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadStylesSync } from "./helpers/styles.mjs";

const styles = loadStylesSync();
const mascot = readFileSync(new URL("../src/components/HomeMascotLogo.tsx", import.meta.url), "utf8");

test("renderer-owned decorative indicators cannot continuously submit frames", () => {
  assert.doesNotMatch(styles, /animation\s*:[^;]*\binfinite\b/);
});

test("home mascot loads only static artwork, not an endlessly decoded GIF", () => {
  assert.doesNotMatch(mascot, /\.gif|mascotMotion/);
  assert.match(mascot, /home-mascot-still-dark\.png/);
  assert.match(mascot, /home-mascot-still-light\.png/);
  assert.match(styles, /:root\[data-theme="light"\] \.home-mascot-logo \.home-mascot-still\.home-mascot-light\s*\{\s*display: block;/);
});

test("retained hidden panes pause descendant and pseudo-element animations", () => {
  assert.match(styles, /\.session-pane\[data-visible="false"\] \*,[\s\S]*?\.session-pane\[data-visible="false"\] \*::before,[\s\S]*?\.session-pane\[data-visible="false"\] \*::after\s*\{\s*animation-play-state: paused !important;/);
});
