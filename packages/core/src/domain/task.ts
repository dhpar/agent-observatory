import { z } from 'zod';

export const TaskStatus = z.enum(['proposed', 'claimed', 'done', 'abandoned']);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** A named unit of work. An Agent's "current task" is its claimed Task. */
export const TaskSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  title: z.string().min(1),
  status: TaskStatus,
  startedAt: z.number().int().optional(),
  finishedAt: z.number().int().optional(),
  metaData: z.record(z.string(), z.unknown()).optional(),
});
export type Task = z.infer<typeof TaskSchema>;
