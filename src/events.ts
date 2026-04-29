import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { eventSchema, type CompanionEvent } from "./schemas";

export async function appendEvent(filePath: string, event: CompanionEvent): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readEvents(
  filePath: string,
  options: { clear?: boolean } = {},
): Promise<CompanionEvent[]> {
  let content = "";
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  const events = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => eventSchema.parse(JSON.parse(line)));

  if (options.clear) {
    await writeFile(filePath, "", "utf8");
  }

  return events;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
