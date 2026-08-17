import { z } from "zod";

/**
 * One committed player free_text ↔ narrative prose pair.
 */
export const WorkingMemoryPairSchema = z
  .object({
    turnId: z.string().min(1),
    user: z.string().min(1),
    assistant: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .strict();

export type WorkingMemoryPair = z.infer<typeof WorkingMemoryPairSchema>;
