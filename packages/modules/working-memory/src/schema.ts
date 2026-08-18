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

/**
 * Authoritative working-memory slice (unbounded archive).
 */
export const WorkingMemorySliceSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(WorkingMemoryPairSchema),
  })
  .strict();

export type WorkingMemorySlice = {
  readonly schemaVersion: 1;
  readonly entries: readonly WorkingMemoryPair[];
};

/**
 * Empty slice seed for new sessions.
 */
export function createEmptyWorkingMemorySlice(): WorkingMemorySlice {
  return {
    schemaVersion: 1,
    entries: [],
  };
}

/**
 * Safely reads the slice from world state (missing → empty).
 *
 * @param raw - slices.working_memory value
 */
export function parseWorkingMemorySlice(raw: unknown): WorkingMemorySlice {
  const parsed = WorkingMemorySliceSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  return createEmptyWorkingMemorySlice();
}

/**
 * Payload for `working_memory.append_pair`.
 */
export const AppendPairPayloadSchema = z
  .object({
    turnId: z.string().min(1),
    user: z.string().min(1),
    assistant: z.string().min(1),
    createdAt: z.string().min(1),
  })
  .strict();

export type AppendPairPayload = z.infer<typeof AppendPairPayloadSchema>;
