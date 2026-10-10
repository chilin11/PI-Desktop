import { readMainModule, readMainSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

/*
 * The main window is opaque on every platform.
 *
 * A `transparent: true` window over native `sidebar` vibrancy makes
 * WindowServer re-blend the whole window with the blurred desktop for every
 * frame Chromium submits. Measured on an M4 / 5K 120 Hz display while a
 * transcript streamed: ~30-36% GPU with vibrancy versus ~15% (the desktop
 * baseline) with an opaque window. Typing and streaming must not cost that.
 */

const mainSource = await readMainSource();
const windowSource = await readMainModule("bootstrap/window.ts");
const lifecycleSource = await readMainModule("bootstrap/app-lifecycle.ts");
const stylesSource = await loadStyles();

const createWindowSource = windowSource.slice(windowSource.indexOf("export async function createWindow("));
const mainWindowBlock =
  createWindowSource.match(/mainWindow = new BrowserWindow\(\{[\s\S]*?\n  \}\);/)?.[0] ?? "";

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected function ${name}`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("the macOS main window stays opaque while retaining upstream platform background policy", () => {
  assert.ok(mainWindowBlock, "expected the main BrowserWindow options");
  assert.doesNotMatch(mainWindowBlock, /vibrancy\s*:/);
  assert.doesNotMatch(mainWindowBlock, /visualEffectState\s*:/);
  assert.doesNotMatch(mainWindowBlock, /transparent\s*:\s*true/);
  assert.doesNotMatch(mainWindowBlock, /#00000000/);
  assert.match(
    mainWindowBlock,
    /\.\.\.mainWindowBackgroundOptions\(\s*process\.platform,\s*initialWindowBackground,\s*windows11NativeCorners,/,
  );
  assert.match(
    windowSource,
    /const initialWindowBackground = builtinWindowBackground\(\s*nativeTheme\.shouldUseDarkColors \? "dark" : "light",?\s*\)/,
  );
  // macOS keeps its inset traffic lights; other platforms stay frameless.
  assert.match(mainWindowBlock, /titleBarStyle:\s*"hiddenInset"/);
  assert.match(mainWindowBlock, /trafficLightPosition:\s*MAC_TRAFFIC_LIGHT_POSITION/);
  assert.match(mainWindowBlock, /frame: false/);
});

test("theme changes never re-apply vibrancy", () => {
  assert.doesNotMatch(mainSource, /setVibrancy\(/);
  const applyNative = functionSource(lifecycleSource, "applyNativeThemeSource");
  assert.match(applyNative, /if \(nativeTheme\.themeSource === next\) return;/);
  assert.match(applyNative, /nativeTheme\.themeSource = next;/);
});

test("macOS renderer ancestry is no longer forced transparent", () => {
  assert.doesNotMatch(
    stylesSource,
    /:root\[data-platform="darwin"\][^{]*\{\s*background:\s*transparent;/,
  );
  assert.doesNotMatch(stylesSource, /--ds-sidebar-glass-/);
  // The base shell and boot splash paint the opaque primary surface.
  const baseShell = stylesSource.match(/\n\.app-shell\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(baseShell, /background:\s*var\(--ds-bg-primary\)/);
  const baseSplash = stylesSource.match(/\n\.startup-splash\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(baseSplash, /background:\s*var\(--ds-bg-primary\)/);
});
