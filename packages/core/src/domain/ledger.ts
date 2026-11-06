import { z } from 'zod';

/**
 * Append-only ledger row. One per token event. Rows are never updated or
 * deleted — corrections are new rows, so the ledger always replays (plan §4).
 */
export const CostLedgerEntrySchema = z.object({
  id: z.string(),
  runId: z.string(),
  spanId: z.string().optional(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  /** Which version of the pricing table priced this row. */
  priceVersion: z.string().optional(),
  fidelity: z.enum(['exact', 'estimated']),
  createdAt: z.number().int(),
});
export type CostLedgerEntry = z.infer<typeof CostLedgerEntrySchema>;
