export function investorShare(contribution: number, pool: number) {
  if (
    !Number.isFinite(pool) ||
    !Number.isFinite(contribution) ||
    !(pool > 0) ||
    !(contribution > 0)
  )
    return 0;
  return Math.min(contribution, pool) / pool;
}

/** Calculates illustrative units, optionally capped to the available pool contribution. */
export function hypotheticalUnits(
  contribution: number,
  unitPrice: number,
  maxContribution = Number.POSITIVE_INFINITY,
) {
  if (
    !Number.isFinite(contribution) ||
    !Number.isFinite(unitPrice) ||
    !(unitPrice > 0) ||
    !(contribution > 0)
  )
    return 0;
  const limit =
    maxContribution === Number.POSITIVE_INFINITY
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

// ==========================================
// Comprehensive Property Financial Algorithm
// ==========================================

export interface PropertyFinancialInputs {
  monthlyGrossRent: number;
  vacancyPct: number; // 0..100
  monthlyOperatingExpenses: number;
  monthlyMaintenanceExpenses: number;
  indicativeMarketValue: number;
  capRatePct: number; // percent e.g. 6.5
  tokenisationPool: number;
  tokenPricePerUnit: number;
}

export interface PropertyFinancialResults {
  annualGrossRent: number;
  annualVacancyAllowance: number;
  effectiveAnnualRentalIncome: number;
  annualOperatingExpenses: number;
  netOperatingIncome: number;
  incomeBasedValuation: number | null;
  incomeBasedValuationEligible: boolean;
  netRentalYield: number;
  maximumTokenSupply: number;
  isPoolDivisible: boolean;
  disclaimer: string;
}

/**
 * A. Effective annual rental income
 * Annual gross rent = monthly gross rent × 12
 */
export function calculateAnnualGrossRent(monthlyGrossRent: number): number {
  if (!Number.isFinite(monthlyGrossRent) || monthlyGrossRent <= 0) return 0;
  return monthlyGrossRent * 12;
}

/**
 * Annual vacancy allowance = annual gross rent × vacancy percentage / 100
 */
export function calculateAnnualVacancyAllowance(
  annualGrossRent: number,
  vacancyPct: number,
): number {
  if (!Number.isFinite(annualGrossRent) || annualGrossRent <= 0) return 0;
  if (!Number.isFinite(vacancyPct) || vacancyPct <= 0) return 0;
  const safeVacancyPct = Math.min(100, Math.max(0, vacancyPct));
  return (annualGrossRent * safeVacancyPct) / 100;
}

/**
 * Effective annual rental income = annual gross rent − vacancy allowance
 */
export function calculateEffectiveAnnualRentalIncome(
  monthlyGrossRent: number,
  vacancyPct: number,
): number {
  const annualGross = calculateAnnualGrossRent(monthlyGrossRent);
  const vacancyAllowance = calculateAnnualVacancyAllowance(annualGross, vacancyPct);
  return Math.max(0, annualGross - vacancyAllowance);
}

/**
 * B. Net operating income
 * Annual expenses = (monthly operating expenses + monthly maintenance expenses) × 12
 */
export function calculateAnnualExpenses(
  monthlyOperating: number,
  monthlyMaintenance: number,
): number {
  const op = Number.isFinite(monthlyOperating) && monthlyOperating > 0 ? monthlyOperating : 0;
  const mt = Number.isFinite(monthlyMaintenance) && monthlyMaintenance > 0 ? monthlyMaintenance : 0;
  return (op + mt) * 12;
}

/**
 * Net operating income (NOI) = effective annual rental income − annual expenses
 * Note: NOI can mathematically be negative if expenses exceed revenue, but we return the raw value
 * so that valuation and yield handle it safely without misleading representations.
 */
export function calculateNetOperatingIncome(
  monthlyGrossRent: number,
  vacancyPct: number,
  monthlyOperating: number,
  monthlyMaintenance: number,
): number {
  const effectiveRent = calculateEffectiveAnnualRentalIncome(monthlyGrossRent, vacancyPct);
  const annualExpenses = calculateAnnualExpenses(monthlyOperating, monthlyMaintenance);
  return effectiveRent - annualExpenses;
}

/**
 * C. Income-based indicative valuation
 * Income-based valuation = NOI / (capitalisation rate / 100)
 * Only calculate when cap rate is greater than zero and NOI > 0.
 * If NOI <= 0 or capRate <= 0, returns null with clear safety handling.
 */
export function calculateIncomeBasedValuation(noi: number, capRatePct: number): number | null {
  if (!Number.isFinite(noi) || noi <= 0) return null;
  if (!Number.isFinite(capRatePct) || capRatePct <= 0) return null;
  return noi / (capRatePct / 100);
}

/**
 * D. Yield
 * Net rental yield = NOI / indicative market value × 100
 * Handles zero market value safely. Clamped to 0 if NOI <= 0.
 */
export function calculateRentalYield(noi: number, indicativeMarketValue: number): number {
  if (!Number.isFinite(indicativeMarketValue) || indicativeMarketValue <= 0) return 0;
  if (!Number.isFinite(noi) || noi <= 0) return 0;
  return (noi / indicativeMarketValue) * 100;
}

/**
 * E. Tokenisation proposal
 * Maximum token supply = floor(tokenisation pool / token price per unit)
 */
export function calculateMaximumTokenSupply(
  tokenisationPool: number,
  tokenPricePerUnit: number,
): number {
  if (!Number.isFinite(tokenisationPool) || tokenisationPool <= 0) return 0;
  if (!Number.isFinite(tokenPricePerUnit) || tokenPricePerUnit <= 0) return 0;
  if (tokenisationPool < tokenPricePerUnit) return 0;
  return Math.floor(tokenisationPool / tokenPricePerUnit);
}

/**
 * Investor hypothetical units = floor(investment amount / token price per unit)
 * Never exceeds available pool supply.
 */
export function calculateInvestorHypotheticalUnits(
  investmentAmount: number,
  tokenPricePerUnit: number,
  tokenisationPool = Number.POSITIVE_INFINITY,
): number {
  return hypotheticalUnits(investmentAmount, tokenPricePerUnit, tokenisationPool);
}

/**
 * Investor pool percentage = hypothetical investment / tokenisation pool × 100
 * Capped at 100%.
 */
export function calculateInvestorPoolPercentage(
  investmentAmount: number,
  tokenisationPool: number,
): number {
  if (!Number.isFinite(tokenisationPool) || tokenisationPool <= 0) return 0;
  if (!Number.isFinite(investmentAmount) || investmentAmount <= 0) return 0;
  const eligibleInvestment = Math.min(investmentAmount, tokenisationPool);
  return (eligibleInvestment / tokenisationPool) * 100;
}

export const FINANCIAL_DISCLAIMER =
  "All calculated figures are illustrative estimates for educational purposes, not guaranteed market valuations, returns, legal ownership rights, or investment advice.";

/**
 * Complete Property Financial Calculation
 */
export function calculatePropertyFinances(
  inputs: PropertyFinancialInputs,
): PropertyFinancialResults {
  const annualGrossRent = calculateAnnualGrossRent(inputs.monthlyGrossRent);
  const annualVacancyAllowance = calculateAnnualVacancyAllowance(
    annualGrossRent,
    inputs.vacancyPct,
  );
  const effectiveAnnualRentalIncome = Math.max(0, annualGrossRent - annualVacancyAllowance);
  const annualOperatingExpenses = calculateAnnualExpenses(
    inputs.monthlyOperatingExpenses,
    inputs.monthlyMaintenanceExpenses,
  );
  const netOperatingIncome = effectiveAnnualRentalIncome - annualOperatingExpenses;
  const incomeBasedValuation = calculateIncomeBasedValuation(netOperatingIncome, inputs.capRatePct);
  const incomeBasedValuationEligible = incomeBasedValuation !== null;
  const netRentalYield = calculateRentalYield(netOperatingIncome, inputs.indicativeMarketValue);
  const maximumTokenSupply = calculateMaximumTokenSupply(
    inputs.tokenisationPool,
    inputs.tokenPricePerUnit,
  );

  const isPoolDivisible =
    inputs.tokenisationPool > 0 &&
    inputs.tokenPricePerUnit > 0 &&
    inputs.tokenisationPool % inputs.tokenPricePerUnit === 0;

  return {
    annualGrossRent,
    annualVacancyAllowance,
    effectiveAnnualRentalIncome,
    annualOperatingExpenses,
    netOperatingIncome,
    incomeBasedValuation,
    incomeBasedValuationEligible,
    netRentalYield,
    maximumTokenSupply,
    isPoolDivisible,
    disclaimer: FINANCIAL_DISCLAIMER,
  };
}
