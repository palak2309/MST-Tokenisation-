import { inr } from "@/lib/data";
import { getPropertyById, isSampleProperty } from "@/lib/propertyStore";

export interface FormErrors {
  propertyId?: string;
  name?: string;
  location?: string;
  indicativeValue?: string;
  monthlyRent?: string;
  vacancyPct?: string;
  monthlyOperating?: string;
  monthlyMaintenance?: string;
  capRatePct?: string;
  unitPrice?: string;
  tokenPool?: string;
}

export interface PropertyFormInputs {
  propertyId: string;
  name: string;
  location: string;
  indicativeValue: number;
  monthlyRent: number;
  vacancyPct: number;
  monthlyOperating: number;
  monthlyMaintenance: number;
  capRatePct: number;
  unitPrice: number;
  tokenPool: number;
  isEditing?: boolean;
}

export function validatePropertyForm(inputs: PropertyFormInputs): FormErrors {
  const errs: FormErrors = {};
  const {
    propertyId,
    name,
    location,
    indicativeValue,
    monthlyRent,
    vacancyPct,
    monthlyOperating,
    monthlyMaintenance,
    capRatePct,
    unitPrice,
    tokenPool,
    isEditing = false,
  } = inputs;

  if (!propertyId.trim()) {
    errs.propertyId = "Property ID is required.";
  } else {
    const bytes = new TextEncoder().encode(propertyId.trim()).length;
    if (bytes < 1 || bytes > 64) {
      errs.propertyId = "Property ID must be between 1 and 64 UTF-8 bytes.";
    } else if (!/^[a-zA-Z0-9_-]+$/.test(propertyId.trim())) {
      errs.propertyId = "ID may only contain letters, numbers, hyphens, and underscores.";
    } else if (!isEditing && isSampleProperty(propertyId.trim())) {
      errs.propertyId = "This ID matches a protected sample property. Choose a different ID.";
    } else if (!isEditing && getPropertyById(propertyId.trim())) {
      errs.propertyId = `A property with ID "${propertyId.trim()}" already exists.`;
    }
  }

  if (!name.trim()) errs.name = "Property name is required.";
  if (!location.trim()) errs.location = "Full location is required.";

  if (!indicativeValue || indicativeValue <= 0 || !Number.isFinite(indicativeValue)) {
    errs.indicativeValue = "Indicative market value must be a positive number greater than zero.";
  }

  if (!Number.isFinite(monthlyRent) || monthlyRent < 0) {
    errs.monthlyRent = "Monthly rent cannot be negative.";
  }

  if (!Number.isFinite(vacancyPct) || vacancyPct < 0 || vacancyPct > 100) {
    errs.vacancyPct = "Vacancy allowance must be between 0% and 100%.";
  }

  if (!Number.isFinite(monthlyOperating) || monthlyOperating < 0) {
    errs.monthlyOperating = "Operating expenses cannot be negative.";
  }

  if (!Number.isFinite(monthlyMaintenance) || monthlyMaintenance < 0) {
    errs.monthlyMaintenance = "Maintenance expenses cannot be negative.";
  }

  if (!Number.isFinite(capRatePct) || capRatePct <= 0) {
    errs.capRatePct = "Capitalisation rate must be a positive percentage greater than 0%.";
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    errs.unitPrice = "Token unit price must be greater than zero.";
  } else if (Number(unitPrice.toFixed(2)) !== unitPrice) {
    errs.unitPrice = "Token unit price cannot have more than 2 decimal places (paise precision).";
  }

  if (!Number.isFinite(tokenPool) || tokenPool <= 0) {
    errs.tokenPool = "Tokenisation pool must be greater than zero.";
  } else if (
    Number.isFinite(indicativeValue) &&
    indicativeValue > 0 &&
    tokenPool > indicativeValue
  ) {
    errs.tokenPool = `Tokenisation pool (${inr(tokenPool)}) cannot exceed the indicative market value (${inr(indicativeValue)}).`;
  } else if (Number.isFinite(unitPrice) && unitPrice > 0) {
    const supply = Math.floor(tokenPool / unitPrice);
    if (supply < 1) {
      errs.tokenPool = `Tokenisation pool (${inr(tokenPool)}) must be at least the price of one unit (${inr(unitPrice)}) to yield at least 1 whole token.`;
    } else if (!Number.isSafeInteger(supply) || supply <= 0) {
      errs.tokenPool = "Calculated token supply must be a valid positive integer.";
    }
  }

  return errs;
}
