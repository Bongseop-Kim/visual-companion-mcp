import { z } from "zod";

export const eventSchema = z.object({
  type: z.string().min(1),
  choice: z.string().optional(),
  text: z.string().optional(),
  timestamp: z.number(),
  dwellMs: z.number().optional(),
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
});

export const showScreenOutputSchema = z.object({
  sessionId: z.string(),
  filePath: z.string(),
  reloadedClients: z.number(),
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

export type CompanionEvent = z.infer<typeof eventSchema>;
export type StartSessionInput = z.input<typeof startSessionInputSchema>;
export type StartSessionOutput = z.infer<typeof startSessionOutputSchema>;
export type ShowScreenInput = z.infer<typeof showScreenInputSchema>;
export type ShowScreenOutput = z.infer<typeof showScreenOutputSchema>;
export type ReadEventsInput = z.input<typeof readEventsInputSchema>;
export type WaitForSelectionInput = z.input<typeof waitForSelectionInputSchema>;
export type WaitForSelectionOutput = z.infer<typeof waitForSelectionOutputSchema>;
export type StopSessionOutput = z.infer<typeof stopSessionOutputSchema>;
