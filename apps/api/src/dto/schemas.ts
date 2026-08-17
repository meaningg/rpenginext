import { z } from "zod";

import { PlayerActionSchema } from "@rpengineext/contracts";

export const CreatePlayerBodySchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
  })
  .strict();

export const CreateSessionBodySchema = z
  .object({
    templateId: z.string().min(1),
    title: z.string().min(1).max(120).optional(),
    runOpening: z.boolean().optional().default(true),
  })
  .strict();

export const PatchSessionBodySchema = z
  .object({
    title: z.string().min(1).max(120),
  })
  .strict();

export const SubmitActionBodySchema = PlayerActionSchema;

export type CreatePlayerBody = z.infer<typeof CreatePlayerBodySchema>;
export type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>;
export type PatchSessionBody = z.infer<typeof PatchSessionBodySchema>;
