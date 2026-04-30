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

export const reviewItemRoleSchema = z.enum(["reference", "draft", "proposal"]);
export const referenceTypeSchema = z.enum(["current", "accepted", "pinned"]);
export const reviewItemKindSchema = z.enum(["html", "image"]);
export const imageMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);

export const reviewItemInputSchema = z.object({
  id: z.string().min(1),
  role: reviewItemRoleSchema,
  title: z.string().min(1),
  kind: reviewItemKindSchema.optional(),
  html: z.string().optional(),
  imagePath: z.string().optional(),
  imageMimeType: imageMimeTypeSchema.optional(),
  imageAlt: z.string().optional(),
  version: z.number().int().min(1).optional(),
  referenceType: referenceTypeSchema.optional(),
  locked: z.boolean().optional(),
  archived: z.boolean().optional(),
  temporary: z.boolean().optional(),
  basedOnId: z.string().min(1).optional(),
  changeSummary: z.string().optional(),
});

export const reviewItemSchema = reviewItemInputSchema.extend({
  version: z.number().int().min(1),
  locked: z.boolean().default(false),
  archived: z.boolean().default(false),
  temporary: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const reviewBoardSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  title: z.string().optional(),
  currentReferenceId: z.string().min(1).optional(),
  acceptedItemIds: z.array(z.string()).default([]),
  items: z.array(reviewItemSchema).default([]),
  screenVersion: z.number().int().min(0),
  updatedAt: z.string(),
});

export const showReviewBoardInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  title: z.string().optional(),
  filename: z.string().min(1).default("review-board.html"),
  currentReferenceId: z.string().min(1).optional(),
  items: z.array(reviewItemInputSchema).min(1),
});

export const updateReviewItemInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  itemId: z.string().min(1),
  html: z.string(),
  title: z.string().min(1).optional(),
  changeSummary: z.string().optional(),
  filename: z.string().min(1).default("review-board.html"),
});

export const addDraftForReferenceInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  referenceItemId: z.string().min(1),
  draftId: z.string().min(1),
  title: z.string().min(1),
  html: z.string(),
  changeSummary: z.string().optional(),
  filename: z.string().min(1).default("review-board.html"),
});

export const updateDraftForReferenceInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  draftId: z.string().min(1),
  html: z.string(),
  title: z.string().min(1).optional(),
  changeSummary: z.string().optional(),
  filename: z.string().min(1).default("review-board.html"),
});

export const addReviewItemsInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  items: z.array(reviewItemInputSchema).min(1),
  filename: z.string().min(1).default("review-board.html"),
});

export const acceptReviewItemInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  itemId: z.string().min(1),
  filename: z.string().min(1).default("review-board.html"),
});

export const archiveReviewItemInputSchema = acceptReviewItemInputSchema;

export const importReferenceImageInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
  itemId: z.string().min(1),
  title: z.string().min(1),
  imagePath: z.string().min(1),
  imageAlt: z.string().optional(),
  filename: z.string().min(1).default("review-board.html"),
});

export const requestReferenceImageInputSchema = importReferenceImageInputSchema.omit({ imagePath: true }).extend({
  timeoutMs: z.number().int().min(1).max(300_000).default(300_000),
});

export const readReviewBoardInputSchema = z.object({
  sessionId: z.string().min(1),
  boardId: z.string().min(1),
});

export const requestReferenceImageOutputSchema = reviewBoardSchema.partial().extend({
  sessionId: z.string(),
  boardId: z.string(),
  timedOut: z.boolean(),
  uploadScreenVersion: z.number().int().min(0),
  filePath: z.string().optional(),
  reloadedClients: z.number().optional(),
  updatedClients: z.number().optional(),
});

export const reviewBoardOutputSchema = reviewBoardSchema.extend({
  filePath: z.string().optional(),
  reloadedClients: z.number().optional(),
  updatedClients: z.number().optional(),
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

export const DEFAULT_REQUESTED_SCHEMA = {
  type: "object" as const,
  properties: {
    response: {
      type: "string" as const,
      title: "Response",
    },
  },
  required: ["response"],
};

export type CompanionEvent = z.infer<typeof eventSchema>;
export type StartSessionInput = z.input<typeof startSessionInputSchema>;
export type StartSessionOutput = z.infer<typeof startSessionOutputSchema>;
export type ShowScreenInput = z.input<typeof showScreenInputSchema>;
export type ShowScreenOutput = z.infer<typeof showScreenOutputSchema>;
export type ReviewItemInput = z.input<typeof reviewItemInputSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type ReviewBoard = z.infer<typeof reviewBoardSchema>;
export type ShowReviewBoardInput = z.input<typeof showReviewBoardInputSchema>;
export type UpdateReviewItemInput = z.input<typeof updateReviewItemInputSchema>;
export type AddDraftForReferenceInput = z.input<typeof addDraftForReferenceInputSchema>;
export type UpdateDraftForReferenceInput = z.input<typeof updateDraftForReferenceInputSchema>;
export type AddReviewItemsInput = z.input<typeof addReviewItemsInputSchema>;
export type AcceptReviewItemInput = z.input<typeof acceptReviewItemInputSchema>;
export type ArchiveReviewItemInput = z.input<typeof archiveReviewItemInputSchema>;
export type ImportReferenceImageInput = z.input<typeof importReferenceImageInputSchema>;
export type RequestReferenceImageInput = z.input<typeof requestReferenceImageInputSchema>;
export type RequestReferenceImageOutput = z.infer<typeof requestReferenceImageOutputSchema>;
export type ReadReviewBoardInput = z.input<typeof readReviewBoardInputSchema>;
export type ReviewBoardOutput = z.infer<typeof reviewBoardOutputSchema>;
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
