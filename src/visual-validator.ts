import { readFile, writeFile } from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { VisualValidationReport } from "./schemas";

export interface ValidateImagesInput {
  id: string;
  referenceItemId: string;
  draftItemId: string;
  referenceImagePath: string;
  draftImagePath: string;
  diffImagePath: string;
  diffImageHref: string;
  threshold: number;
  maxDiffRatio: number;
}

export async function validateImages(input: ValidateImagesInput): Promise<VisualValidationReport> {
  const reference = PNG.sync.read(await readFile(input.referenceImagePath));
  const draft = PNG.sync.read(await readFile(input.draftImagePath));
  const warnings: string[] = [];
  const createdAt = new Date().toISOString();

  if (reference.width !== draft.width || reference.height !== draft.height) {
    warnings.push(
      `Image dimensions differ: reference ${reference.width}x${reference.height}, draft ${draft.width}x${draft.height}.`,
    );
    return {
      id: input.id,
      referenceItemId: input.referenceItemId,
      draftItemId: input.draftItemId,
      status: "failed",
      threshold: input.threshold,
      maxDiffRatio: input.maxDiffRatio,
      diffPixels: Math.max(reference.width * reference.height, draft.width * draft.height),
      totalPixels: Math.max(reference.width * reference.height, draft.width * draft.height),
      diffRatio: 1,
      width: 0,
      height: 0,
      dimensionMismatch: true,
      referenceImagePath: input.referenceImagePath,
      draftImagePath: input.draftImagePath,
      warnings,
      createdAt,
    };
  }

  const diff = new PNG({ width: reference.width, height: reference.height });
  const diffPixels = pixelmatch(reference.data, draft.data, diff.data, reference.width, reference.height, {
    threshold: input.threshold,
  });
  await writeFile(input.diffImagePath, PNG.sync.write(diff));
  const totalPixels = reference.width * reference.height;
  const diffRatio = totalPixels === 0 ? 0 : diffPixels / totalPixels;
  const status = diffRatio <= input.maxDiffRatio ? "passed" : diffRatio <= input.maxDiffRatio * 1.5 ? "warning" : "failed";

  return {
    id: input.id,
    referenceItemId: input.referenceItemId,
    draftItemId: input.draftItemId,
    status,
    threshold: input.threshold,
    maxDiffRatio: input.maxDiffRatio,
    diffPixels,
    totalPixels,
    diffRatio: Number(diffRatio.toFixed(6)),
    width: reference.width,
    height: reference.height,
    dimensionMismatch: false,
    referenceImagePath: input.referenceImagePath,
    draftImagePath: input.draftImagePath,
    diffImagePath: input.diffImageHref,
    warnings,
    createdAt,
  };
}
