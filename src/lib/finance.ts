export function investorShare(contribution: number, pool: number) {
  if (!Number.isFinite(pool) || !Number.isFinite(contribution) || !(pool > 0) || !(contribution > 0)) return 0;
  return Math.min(contribution, pool) / pool;
}

/** Calculates illustrative units, optionally capped to the available pool contribution. */
export function hypotheticalUnits(
  contribution: number,
  unitPrice: number,
  maxContribution = Number.POSITIVE_INFINITY,
) {
  if (!Number.isFinite(contribution) || !Number.isFinite(unitPrice) || !(unitPrice > 0) || !(contribution > 0)) return 0;
  const limit = maxContribution === Number.POSITIVE_INFINITY
    ? contribution
    : Number.isFinite(maxContribution)
      ? Math.max(0, maxContribution)
      : 0;
  return Math.floor(Math.min(contribution, limit) / unitPrice);
}

export interface RentalInputs {
  gross: number;
  operating: number;
  maintenance: number;
  vacancyPct: number; // percent of gross
  share: number; // 0..1
}

export function rental(i: RentalInputs) {
  const gross = Number.isFinite(i.gross) ? Math.max(0, i.gross) : 0;
  const operating = Number.isFinite(i.operating) ? Math.max(0, i.operating) : 0;
  const maintenance = Number.isFinite(i.maintenance) ? Math.max(0, i.maintenance) : 0;
  const vacancyPct = Number.isFinite(i.vacancyPct) ? Math.max(0, i.vacancyPct) : 0;
  const share = Number.isFinite(i.share) ? Math.max(0, Math.min(1, i.share)) : 0;
  const vacancy = (gross * vacancyPct) / 100;
  const net = Math.max(0, gross - operating - maintenance - vacancy);
  const monthly = net * share;
  return { vacancy, net, monthly, annual: monthly * 12 };
}
