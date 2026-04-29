import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendEvent, readEvents } from "./events";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("events", () => {
  test("appends, reads, and clears JSONL events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vc-events-"));
    tempDirs.push(dir);
    const eventsPath = join(dir, "events.jsonl");

    await appendEvent(eventsPath, {
      type: "click",
      choice: "a",
      text: "Option A",
      timestamp: 1,
      dwellMs: 10,
      screenVersion: 2,
    });

    expect(await readEvents(eventsPath)).toEqual([
      {
        type: "click",
        choice: "a",
        text: "Option A",
        timestamp: 1,
        dwellMs: 10,
        screenVersion: 2,
      },
    ]);
    expect(await readEvents(eventsPath, { clear: true })).toHaveLength(1);
    expect(await readEvents(eventsPath)).toEqual([]);
  });
});
