/**
 * Proportional rental allocation (calculation only).
 *
 * This module only CALCULATES who would be owed what. It does not move money,
 * and no funded payout system exists yet.
 *
 * Rules:
 * - Holdings are read at a fixed record point (a block number) for one property token.
 * - Eligible holders: balance > 0 and not in `excludedHolders` (e.g. an issuer treasury).
 * - share = floor(amount * units / totalEligibleUnits), using integer (bigint) maths only.
 * - The residual (amount - sum of shares) is never sent to anyone; it is carried
 *   forward explicitly as `residual`.
 * - If no eligible units exist, nothing is allocated and the whole amount is residual.
 * - Each (tokenId, periodId) can be allocated only once.
 * - Unclaimed shares stay owed to the holder; they are never redistributed.
 */

export type Holding = { holder: string; units: bigint };

export type AllocationInput = {
  tokenId: bigint;
  periodId: string; // e.g. "2026-10"
  recordBlock: bigint;
  amount: bigint; // smallest currency unit, e.g. paise
  holdings: Holding[];
  excludedHolders?: string[];
};

export type Allocation = {
  tokenId: bigint;
  periodId: string;
  recordBlock: bigint;
  amount: bigint;
  totalEligibleUnits: bigint;
  shares: { holder: string; units: bigint; amount: bigint }[];
  allocated: bigint;
  residual: bigint;
};

const key = (tokenId: bigint, periodId: string) => `${tokenId.toString()}:${periodId}`;

export function allocateRental(input: AllocationInput): Allocation {
  if (input.amount < 0n) throw new Error("amount must not be negative");
  if (!input.periodId.trim()) throw new Error("periodId is required");
  const excluded = new Set((input.excludedHolders ?? []).map((a) => a.toLowerCase()));

  const merged = new Map<string, bigint>();
  for (const h of input.holdings) {
    if (h.units < 0n) throw new Error("units must not be negative");
    const addr = h.holder.toLowerCase();
    if (excluded.has(addr) || h.units === 0n) continue;
    merged.set(addr, (merged.get(addr) ?? 0n) + h.units);
  }

  const eligible = [...merged.entries()]
    .map(([holder, units]) => ({ holder, units }))
    .sort((a, b) => (a.holder < b.holder ? -1 : 1));
  const totalEligibleUnits = eligible.reduce((s, h) => s + h.units, 0n);

  if (totalEligibleUnits === 0n) {
    return {
      tokenId: input.tokenId,
      periodId: input.periodId,
      recordBlock: input.recordBlock,
      amount: input.amount,
      totalEligibleUnits: 0n,
      shares: [],
      allocated: 0n,
      residual: input.amount,
    };
  }

  const shares = eligible.map((h) => ({
    holder: h.holder,
    units: h.units,
    amount: (input.amount * h.units) / totalEligibleUnits,
  }));
  const allocated = shares.reduce((s, x) => s + x.amount, 0n);
  return {
    tokenId: input.tokenId,
    periodId: input.periodId,
    recordBlock: input.recordBlock,
    amount: input.amount,
    totalEligibleUnits,
    shares,
    allocated,
    residual: input.amount - allocated,
  };
}

/** In-memory ledger enforcing one allocation per (tokenId, periodId) and tracking claims. */
export class AllocationLedger {
  private allocations = new Map<string, Allocation>();
  private claimed = new Map<string, Set<string>>();

  record(input: AllocationInput): Allocation {
    const k = key(input.tokenId, input.periodId);
    if (this.allocations.has(k)) {
      throw new Error(`period ${input.periodId} already allocated for token ${input.tokenId}`);
    }
    const result = allocateRental(input);
    this.allocations.set(k, result);
    this.claimed.set(k, new Set());
    return result;
  }

  markClaimed(tokenId: bigint, periodId: string, holder: string): bigint {
    const k = key(tokenId, periodId);
    const alloc = this.allocations.get(k);
    if (!alloc) throw new Error("unknown period");
    const addr = holder.toLowerCase();
    const share = alloc.shares.find((s) => s.holder === addr);
    if (!share || share.amount === 0n) throw new Error("nothing owed");
    const set = this.claimed.get(k)!;
    if (set.has(addr)) throw new Error("already claimed");
    set.add(addr);
    return share.amount;
  }

  unclaimed(tokenId: bigint, periodId: string): bigint {
    const k = key(tokenId, periodId);
    const alloc = this.allocations.get(k);
    if (!alloc) throw new Error("unknown period");
    const set = this.claimed.get(k)!;
    return alloc.shares.filter((s) => !set.has(s.holder)).reduce((t, s) => t + s.amount, 0n);
  }
}
