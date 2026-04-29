import { z } from "zod";

export const eventSchema = z.object({
  type: z.string().min(1),
  choice: z.string().optional(),
  text: z.string().optional(),
  content: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
  timestamp: z.number(),
  dwellMs: z.number().optional(),
  screenVersion: z.number().int().min(0).optional(),
});

export const startSessionInputSchema = z.object({
  host: z.string().default("127.0.0.1"),
  urlHost: z.string().default("localhost"),
  port: z.number().int().min(0).max(65535).optional(),
  baseDir: z.string().optional(),
});

export const startSessionOutputSchema = z.object({
  sessionId: z.string(),
  url: z.string(),
  host: z.string(),
  port: z.number(),
  workDir: z.string(),
  eventsPath: z.string(),
});

export const showScreenInputSchema = z.object({
  sessionId: z.string().min(1),
  filename: z.string().min(1),
  html: z.string(),
  delivery: z.enum(["auto", "reload", "patch-html", "replace-body"]).default("auto"),
  patchSelector: z.string().min(1).default(".vc-frame"),
  clearEvents: z.boolean().default(false),
});

export const showScreenOutputSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
  reloadedClients: z.number(),
  updatedClients: z.number(),
  screenVersion: z.number().int().min(0),
  wireframeSummaryPath: z.string().optional(),
});

const wireframeRegionSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  role: z.string().optional(),
  priority: z.enum(["primary", "secondary", "supporting"]).optional(),
  contains: z.array(z.string()).default([]),
});

const wireframeChoiceSummarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const wireframeSummarySchema = z.object({
  screenPurpose: z.string().min(1),
  layoutPattern: z.string().min(1),
  viewport: z.enum(["desktop", "mobile", "split", "responsive"]).optional(),
  primaryRegion: z.string().optional(),
  secondaryRegions: z.array(z.string()).default([]),
  regions: z.array(wireframeRegionSummarySchema).default([]),
  primaryAction: z.string().optional(),
  choices: z.array(wireframeChoiceSummarySchema).default([]),
  notes: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
});

const selectableItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  details: z.array(z.string()).default([]),
});

const screenBaseSchema = z.object({
  sessionId: z.string().min(1),
  filename: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  clearEvents: z.boolean().default(true),
});

export const showOptionsInputSchema = screenBaseSchema.extend({
  options: z.array(selectableItemSchema).min(1),
  multiselect: z.boolean().default(false),
});

export const showCardsInputSchema = screenBaseSchema.extend({
  cards: z
    .array(
      selectableItemSchema.extend({
        imageLabel: z.string().optional(),
      }),
    )
    .min(1),
});

export const showChoiceGridInputSchema = screenBaseSchema.extend({
  choices: z
    .array(
      z.object({
        choiceId: z.string().min(1),
        title: z.string().min(1),
        thumbHtml: z.string().optional(),
        bullets: z.array(z.string()).default([]),
        badge: z.string().optional(),
      }),
    )
    .min(1),
  wireframeSummary: wireframeSummarySchema.optional(),
});

export const comparisonItemSchema = selectableItemSchema.extend({
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
});

export const showComparisonInputSchema = screenBaseSchema.extend({
  items: z.array(comparisonItemSchema).min(2),
});

export const showWireframeInputSchema = screenBaseSchema.extend({
  variant: z.enum(["desktop", "mobile", "split"]).default("desktop"),
  choice: z.string().default("wireframe"),
  sections: z.array(z.string()).default(["Navigation", "Hero", "Content", "Actions"]),
  wireframeSummary: wireframeSummarySchema.optional(),
});

export const readCurrentWireframeSummaryInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const readCurrentWireframeSummaryOutputSchema = z.object({
  sessionId: z.string(),
  screenVersion: z.number().int().min(0).optional(),
  filename: z.string().optional(),
  wireframeSummary: wireframeSummarySchema.optional(),
  wireframeSummaryPath: z.string().optional(),
  events: z.array(eventSchema).default([]),
});

export const readEventsInputSchema = z.object({
  sessionId: z.string().min(1),
  clear: z.boolean().default(false),
});

export const readEventsOutputSchema = z.object({
  events: z.array(eventSchema),
});

export const waitForSelectionInputSchema = z.object({
  sessionId: z.string().min(1),
  timeoutMs: z.number().int().min(1).max(300_000).default(60_000),
  sinceScreenVersion: z.number().int().min(0).optional(),
});

export const waitForSelectionOutputSchema = z.object({
  events: z.array(eventSchema),
  timedOut: z.boolean(),
});

export const stopSessionInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const stopSessionOutputSchema = z.object({
  sessionId: z.string(),
  stopped: z.boolean(),
});

const primitiveJsonSchema = z.record(z.unknown());

export const requestUserInputSchema = z.object({
  modePreference: z.enum(["auto", "mcp_form", "browser", "url"]).default("auto"),
  message: z.string().min(1),
  requestedSchema: primitiveJsonSchema.optional(),
  sensitive: z.boolean().default(false),
  url: z.string().url().optional(),
  elicitationId: z.string().optional(),
  sessionId: z.string().min(1).optional(),
  filename: z.string().min(1).default("input-request.html"),
  timeoutMs: z.number().int().min(1).max(300_000).default(120_000),
});

export const requestUserInputOutputSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  content: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
    .optional(),
  mode: z.enum(["mcp_form", "browser", "url"]),
  sessionId: z.string().optional(),
  url: z.string().optional(),
  timedOut: z.boolean().optional(),
});

export type CompanionEvent = z.infer<typeof eventSchema>;
export type StartSessionInput = z.input<typeof startSessionInputSchema>;
export type StartSessionOutput = z.infer<typeof startSessionOutputSchema>;
export type ShowScreenInput = z.input<typeof showScreenInputSchema>;
export type ShowScreenOutput = z.infer<typeof showScreenOutputSchema>;
export type WireframeSummary = z.infer<typeof wireframeSummarySchema>;
export type ShowOptionsInput = z.infer<typeof showOptionsInputSchema>;
export type ShowCardsInput = z.infer<typeof showCardsInputSchema>;
export type ShowChoiceGridInput = z.infer<typeof showChoiceGridInputSchema>;
export type ShowComparisonInput = z.infer<typeof showComparisonInputSchema>;
export type ShowWireframeInput = z.infer<typeof showWireframeInputSchema>;
export type ReadCurrentWireframeSummaryOutput = z.infer<typeof readCurrentWireframeSummaryOutputSchema>;
export type ReadEventsInput = z.input<typeof readEventsInputSchema>;
export type WaitForSelectionInput = z.input<typeof waitForSelectionInputSchema>;
export type WaitForSelectionOutput = z.infer<typeof waitForSelectionOutputSchema>;
export type StopSessionOutput = z.infer<typeof stopSessionOutputSchema>;
export type RequestUserInput = z.infer<typeof requestUserInputSchema>;
export type RequestUserInputOutput = z.infer<typeof requestUserInputOutputSchema>;
