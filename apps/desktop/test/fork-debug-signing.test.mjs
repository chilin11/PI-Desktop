import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../build/fork-debug.cjs");
const { verifyDebugBundle } = require("../../../scripts/verify-macos-debug-signing.cjs");

test("fork debug packaging seals its own identity and keeps privacy declarations", () => {
  assert.equal(config.appId, "io.github.chilin11.pi-desktop-fork");
  assert.equal(config.productName, "PI-Desktop Fork");
  assert.equal(config.mac.identity, "-");
  assert.equal(config.mac.notarize, false);
  assert.ok(config.mac.extendInfo.NSLocalNetworkUsageDescription);
  assert.deepEqual(config.mac.binaries, ["Contents/Resources/bin/pi-desktop-host-core"]);
  assert.match(config.afterSign, /scripts\/verify-macos-debug-signing\.cjs$/);
  assert.ok(config.extraResources.length > 0);
});

test("debug verifier rejects a missing privacy string or invalid bundle", () => {
  assert.throws(() => verifyDebugBundle("/fixture.app", () => ""), /Missing local network/);
  assert.throws(() => verifyDebugBundle("/fixture.app", (command) => {
    if (command === "codesign") throw new Error("invalid resources");
    return "fixture";
  }), /invalid resources/);
});

test("debug verifier checks complete app and extraResource host separately", () => {
  const calls = [];
  verifyDebugBundle("/fixture.app", (command, args) => {
    calls.push([command, args]);
    return "fixture";
  });
  const checks = calls.filter(([command]) => command === "codesign");
  assert.equal(checks.length, 2);
  assert.ok(checks[0][1].includes("--deep"));
  assert.ok(checks[0][1].includes("--strict"));
  assert.match(checks[1][1].at(-1), /Contents\/Resources\/bin\/pi-desktop-host-core$/);
});
