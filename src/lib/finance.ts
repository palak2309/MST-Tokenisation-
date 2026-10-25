export function investorShare(contribution: number, pool: number) {
  if (!(pool > 0) || !(contribution > 0)) return 0;
  return Math.min(contribution, pool) / pool;
}

export function hypotheticalUnits(contribution: number, unitPrice: number) {
  if (!(unitPrice > 0) || !(contribution > 0)) return 0;
  return Math.floor(contribution / unitPrice);
}

export interface RentalInputs {
  gross: number;
  operating: number;
  maintenance: number;
  vacancyPct: number; // percent of gross
  share: number; // 0..1
}

export function rental(i: RentalInputs) {
  const vacancy = (i.gross * Math.max(0, i.vacancyPct)) / 100;
  const net = Math.max(0, i.gross - i.operating - i.maintenance - vacancy);
  const monthly = net * Math.max(0, Math.min(1, i.share));
  return { vacancy, net, monthly, annual: monthly * 12 };
}
