import assert from "node:assert/strict";
import test from "node:test";
import { createFrameBatcher } from "../src/lib/frame-batcher.ts";

test("frame batcher keeps the latest value for each stream target", () => {
  const batches = [];
  const batcher = createFrameBatcher((values) => {
    batches.push([...values]);
  });

  batcher.enqueue("message:a", "first");
  batcher.enqueue("message:a", "latest");
  batcher.enqueue("tool:b", "tool");
  assert.equal(batches.length, 0);

  batcher.flushNow();

  assert.deepEqual(batches, [["latest", "tool"]]);
  assert.equal(batcher.size, 0);
});

test("frame batcher flushes immediately without leaving a timer", () => {
  const batches = [];
  const batcher = createFrameBatcher((values) => batches.push([...values]));

  batcher.enqueue("message:a", 1);
  batcher.flushNow();
  batcher.flushNow();

  assert.deepEqual(batches, [[1]]);
  assert.equal(batcher.size, 0);
});

test("frame batcher can concatenate values for the same stream target", () => {
  const batches = [];
  const batcher = createFrameBatcher((values) => {
    batches.push([...values]);
  });

  batcher.enqueue("message:a", "Hel", (previous, next) => previous + next);
  batcher.enqueue("message:a", "lo", (previous, next) => previous + next);
  batcher.flushNow();

  assert.deepEqual(batches, [["Hello"]]);
});

test("an interval batcher commits a token stream at most once per interval", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const batches = [];
  const batcher = createFrameBatcher(
    (values) => batches.push([...values]),
    { minIntervalMs: 100, now: () => clock },
  );
  const concat = (previous, next) => previous + next;

  // First delta has no previous flush, so it is not held back by the interval.
  batcher.enqueue("message:a", "a", concat);
  batcher.flushNow();
  assert.deepEqual(batches, [["a"]]);

  // Ten tokens arriving over 90ms coalesce into one pending commit.
  for (let i = 0; i < 10; i += 1) {
    clock += 9;
    batcher.enqueue("message:a", String(i), concat);
  }
  assert.equal(batches.length, 1, "no commit inside the interval");

  clock = 100;
  t.mock.timers.tick(100);
  assert.deepEqual(batches, [["a"], ["0123456789"]]);
  assert.equal(batcher.size, 0);
});

test("a terminal flush never waits behind the stream interval", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let clock = 0;
  const batches = [];
  const batcher = createFrameBatcher(
    (values) => batches.push([...values]),
    { minIntervalMs: 100, now: () => clock },
  );
  batcher.enqueue("message:a", "first");
  batcher.flushNow();
  clock = 10;
  batcher.enqueue("message:a", "final");
  batcher.flushNow();
  assert.deepEqual(batches, [["first"], ["final"]]);
  // The cancelled interval timer must not flush an empty batch later.
  t.mock.timers.tick(200);
  assert.equal(batches.length, 2);
});
