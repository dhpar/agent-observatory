import { z } from 'zod';

/**
 * Why this row's price is what it is:
 * - 'metered'  priced by the versioned pricing table (M3)
 * - 'free'     served via a free tier — $0 on purpose
 * - 'local'    open-weights on your own hardware — $0 on purpose
 * - 'unknown'  endpoint not priced YET (pricing table pending). Honest zero.
 *               NEVER misreport an unknown as free — budgets must be able to
 *               tell the difference.
 */
export const CostClass = z.enum(['free', 'local', 'metered', 'unknown']);
export type CostClass = z.infer<typeof CostClass>;

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
  costClass: CostClass.default('unknown'),
  /** Which version of the pricing table priced this row. */
  priceVersion: z.string().optional(),
  fidelity: z.enum(['exact', 'estimated']),
  createdAt: z.number().int(),
});
export type CostLedgerEntry = z.infer<typeof CostLedgerEntrySchema>;
