import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { loadStylesSync } from "../apps/desktop/test/helpers/styles.mjs";

// Test actual CSS animation lifecycles without launching Desktop or using user data.
// This is not a measurement of native macOS vibrancy or whole-system GPU load.
const chrome = process.env.CHROME_BIN ?? (process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : "chromium");
const profile = await mkdtemp(join(tmpdir(), "pi-bounded-motion-"));
const scheduled = await readFile(new URL("../apps/desktop/src/features/scheduled/scheduled-workspace.css", import.meta.url), "utf8");
const fixture = `<!doctype html><html><head><style>
${loadStylesSync()}
${scheduled}
:root { --ds-text-secondary: #aaa; --ds-text-primary: #eee; --ds-border-default: #555;
--ds-purple: #b89cff; --ds-warning: #e9b45f; --motion-ease-standard: ease; }
body { background: #181818; color: #eee; padding: 20px; }
</style></head><body>
<div class="working-indicator-mark"><span id="working"></span><span></span><span></span></div>
<span id="label" class="tool-row-name running">Running <span id="elapsed">1s</span></span>
<div class="subagent-topology-node outcome-creating"><span id="subagent" class="subagent-topology-status-icon"></span></div>
<div id="run" class="tool-row-state is-running"><span id="run-dot" class="tool-row-state-dot"></span></div>
<span id="spinner" class="tool-spinner"></span>
<div class="assistant-turn-fragment smooth-cursor"><div class="prose-chat"><p id="cursor">Streaming text</p></div></div>
<span id="scheduled" class="scheduled-task-live">Running</span>
<div class="session-switch-progress"><span id="switch-progress"></span></div>
<div class="plugins-install-bar is-indeterminate"><span id="install-progress" class="plugins-install-bar-fill"></span></div>
<button id="stop">Stop</button>
<script>
window.samples = [
 ['working', null], ['label', '::after'], ['subagent', null],
 ['run-dot', null], ['spinner', null], ['cursor', '::after'], ['scheduled', null],
 ['switch-progress', null], ['install-progress', null]
];
window.readMarkers = () => samples.map(([id, pseudo]) => {
 const element = document.getElementById(id);
 const style = getComputedStyle(element, pseudo);
 return { id, opacity: Number(style.opacity), display: style.display,
  visibility: style.visibility, iterations: style.animationIterationCount,
  transform: style.transform, color: style.color, background: style.backgroundColor };
});
</script></body></html>`;
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(fixture);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"],
  { stdio: "ignore" });
let browserError;
browser.on("error", error => { browserError = error; });
let socket;
try {
  let port;
  const deadline = Date.now() + 15000;
  while (!port && Date.now() < deadline) {
    if (browserError) throw browserError;
    if (browser.exitCode !== null) throw new Error(`Chrome exited ${browser.exitCode}`);
    try { port = Number((await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!port) await delay(50);
  }
  assert.ok(port, "Chrome did not expose a CDP port");
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(target => target.type === "page");
  assert.ok(page, "missing Chrome page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  let loads = 0;
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Page.loadEventFired") loads += 1;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`${method} timed out`)); }, 10000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send("Page.enable");
  const navigate = async () => {
    const previousLoads = loads;
    await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
    const readyDeadline = Date.now() + 5000;
    while (loads === previousLoads) {
      assert.ok(Date.now() < readyDeadline, "fixture did not load");
      await delay(25);
    }
    assert.ok(await evaluate("typeof window.readMarkers === 'function'"));
  };
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await navigate();
  const initial = await evaluate("document.getAnimations().map(a => ({ name: a.animationName, iterations: a.effect.getTiming().iterations }))");
  assert.ok(initial.length >= 7, "work animations must be present before settling");
  assert.ok(initial.every(animation => animation.iterations === 2), JSON.stringify(initial));
  await evaluate(`Promise.race([
    Promise.all(document.getAnimations().map(a => a.finished)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('work animations did not settle')), 6000))
  ])`);
  assert.equal(await evaluate("document.getAnimations().filter(a => a.playState === 'running').length"), 0);
  const settled = await evaluate("readMarkers()");
  for (const marker of settled) {
    assert.ok(marker.opacity >= 0.35, `${marker.id} faded out`);
    assert.notEqual(marker.display, "none");
    assert.notEqual(marker.visibility, "hidden");
  }
  for (const id of ["switch-progress", "install-progress"]) {
    assert.equal(await evaluate(`getComputedStyle(document.getElementById('${id}')).transform`),
      "matrix(1, 0, 0, 1, 0, 0)", `${id} must stay in view after settling`);
  }
  await evaluate("document.getElementById('elapsed').textContent = '60s'; document.getElementById('cursor').textContent = 'More streamed text';");
  assert.equal(await evaluate("document.getAnimations().filter(a => a.playState === 'running').length"), 0,
    "text and elapsed-time changes must not restart decorative animations");
  await evaluate("document.getElementById('run').classList.remove('is-running'); void document.getElementById('run').offsetWidth; document.getElementById('run').classList.add('is-running');");
  assert.ok(await evaluate("document.getAnimations().some(a => a.animationName === 'tool-row-state-pulse' && a.playState === 'running')"),
    "a new running state should retain its short animation cue");
  await evaluate(`const pane = document.createElement('div');
    pane.className = 'session-pane'; pane.dataset.visible = 'true';
    pane.innerHTML = '<span class="tool-spinner"></span><span class="tool-row-name running">Hidden</span>';
    document.body.appendChild(pane);`);
  assert.equal(await evaluate(`document.getAnimations().filter(a =>
    a.effect.target.closest('.session-pane')).length`), 2);
  await evaluate(`document.querySelector('.session-pane').dataset.visible = 'false'`);
  assert.deepEqual(await evaluate(`(() => { const pane = document.querySelector('.session-pane');
    return [getComputedStyle(pane.querySelector('.tool-spinner')).animationPlayState,
     getComputedStyle(pane.querySelector('.tool-row-name'), '::after').animationPlayState]; })()`),
    ['paused', 'paused']);
  assert.equal(await evaluate(`document.getAnimations().filter(a =>
    a.effect.target.closest('.session-pane') && a.playState === 'running').length`), 0);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate();
  assert.equal(await evaluate("document.getAnimations().filter(a => a.playState === 'running').length"), 0,
    "reduced motion must suppress all fixture animations");
  console.log("PASS: work animations settle, markers stay visible, text updates do not replay, new runs replay, reduced motion is static.");
  console.log(JSON.stringify({ chrome, settled }, null, 2));
} finally {
  socket?.close();
  if (browser.exitCode === null && !browserError) {
    const exited = new Promise(resolve => browser.once("exit", resolve));
    browser.kill("SIGTERM");
    await exited;
  }
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
