import { useSyncExternalStore } from "react";
import { PROPERTIES, type Property } from "./sampleProperties";
import { addActivity } from "./activity";

const STORAGE_KEY = "mst_demo_user_properties";

const EMPTY_USER_PROPERTIES: Property[] = [];

let memoryUserProperties: Property[] = EMPTY_USER_PROPERTIES;
let cachedAllProperties: Property[] = PROPERTIES;
let isHydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function updateState(newUserProps: Property[]) {
  memoryUserProperties = newUserProps;
  cachedAllProperties = newUserProps.length > 0 ? [...newUserProps, ...PROPERTIES] : PROPERTIES;
}

function loadFromStorage(): Property[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return EMPTY_USER_PROPERTIES;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_USER_PROPERTIES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((p): p is Property =>
        Boolean(p && typeof p === "object" && typeof p.id === "string" && p.name),
      );
      return valid.length > 0 ? valid : EMPTY_USER_PROPERTIES;
    }
    return EMPTY_USER_PROPERTIES;
  } catch (e) {
    console.warn("Failed to load user properties from localStorage:", e);
    return EMPTY_USER_PROPERTIES;
  }
}

function saveToStorage(properties: Property[]): boolean {
  updateState(properties);
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
      notify();
      return true;
    } catch (e) {
      console.error("Failed to save user properties to localStorage:", e);
      return false;
    }
  }
  notify();
  return true;
}

export function ensureHydrated() {
  if (!isHydrated) {
    isHydrated = true;
    const loaded = loadFromStorage();
    if (loaded.length > 0) {
      updateState(loaded);
    }
  }
}

// Immediate hydration in browser client
if (typeof window !== "undefined") {
  ensureHydrated();
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      const loaded = loadFromStorage();
      updateState(loaded);
      notify();
    }
  });
}

/**
 * Checks if an ID belongs to a permanent seeded sample property.
 */
export function isSampleProperty(id: string): boolean {
  return PROPERTIES.some((p) => p.id.toLowerCase() === id.trim().toLowerCase());
}

/**
 * Returns all user-created demo properties.
 * Always returns a referentially stable array.
 */
export function getUserProperties(): Property[] {
  ensureHydrated();
  return memoryUserProperties;
}

/**
 * Returns all properties: user-created demo properties first, then sample properties.
 * Always returns a referentially stable array.
 */
export function getAllProperties(): Property[] {
  ensureHydrated();
  return cachedAllProperties;
}

/**
 * Finds a property by its ID across both user-created demo properties and sample properties.
 */
export function getPropertyById(id: string | undefined): Property | undefined {
  if (!id) return undefined;
  ensureHydrated();
  const trimmed = id.trim().toLowerCase();
  const userProp = memoryUserProperties.find((p) => p.id.toLowerCase() === trimmed);
  if (userProp) return userProp;
  return PROPERTIES.find((p) => p.id.toLowerCase() === trimmed);
}

/**
 * Generate a unique Property ID that does not collide with sample or existing user properties.
 */
export function generatePropertyId(prefix = "PRP-DEMO"): string {
  ensureHydrated();
  let attempt = 0;
  while (attempt < 1000) {
    const randomHex = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}-${randomHex}`;
    if (!getPropertyById(candidate)) {
      return candidate;
    }
    attempt++;
  }
  return `${prefix}-${Date.now().toString().slice(-4)}`;
}

export interface SavePropertyResult {
  success: boolean;
  error?: string | undefined;
  property?: Property | undefined;
}

/**
 * Validate a property record before saving
 */
export function validatePropertyRecord(
  p: Partial<Property>,
  isUpdate = false,
): { valid: boolean; error?: string | undefined } {
  if (!p.id || !p.id.trim()) {
    return { valid: false, error: "Property ID cannot be empty." };
  }
  const idUtf8Bytes = new TextEncoder().encode(p.id.trim()).length;
  if (idUtf8Bytes < 1 || idUtf8Bytes > 64) {
    return { valid: false, error: "Property ID must be between 1 and 64 UTF-8 bytes." };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(p.id.trim())) {
    return {
      valid: false,
      error: "Property ID may only contain letters, numbers, underscores, and hyphens.",
    };
  }

  // Prevent overwriting sample properties
  if (isSampleProperty(p.id.trim())) {
    return { valid: false, error: "Cannot overwrite or modify seeded sample properties." };
  }

  // Check collision for new properties
  if (!isUpdate) {
    const existing = memoryUserProperties.find(
      (item) => item.id.toLowerCase() === p.id!.trim().toLowerCase(),
    );
    if (existing) {
      return { valid: false, error: `A property with ID "${p.id.trim()}" already exists.` };
    }
  }

  if (!p.name || !p.name.trim()) {
    return { valid: false, error: "Property name is required." };
  }
  if (!p.location || !p.location.trim()) {
    return { valid: false, error: "Full location is required." };
  }
  if (p.indicativeValue === undefined || p.indicativeValue <= 0) {
    return { valid: false, error: "Indicative market value must be greater than zero." };
  }
  if (p.monthlyRent === undefined || p.monthlyRent < 0) {
    return { valid: false, error: "Monthly gross rent cannot be negative." };
  }
  if (p.vacancyPct !== undefined && (p.vacancyPct < 0 || p.vacancyPct > 100)) {
    return { valid: false, error: "Vacancy allowance must be between 0% and 100%." };
  }
  if (p.monthlyOperating !== undefined && p.monthlyOperating < 0) {
    return { valid: false, error: "Monthly operating expenses cannot be negative." };
  }
  if (p.monthlyMaintenance !== undefined && p.monthlyMaintenance < 0) {
    return { valid: false, error: "Monthly maintenance expenses cannot be negative." };
  }
  if (p.capRatePct !== undefined && p.capRatePct < 0) {
    return { valid: false, error: "Capitalisation rate cannot be negative." };
  }
  if (p.unitPrice === undefined || p.unitPrice <= 0) {
    return { valid: false, error: "Price per token/unit must be greater than zero." };
  }
  if (p.poolSize === undefined || p.poolSize <= 0) {
    return { valid: false, error: "Proposed tokenisation pool must be greater than zero." };
  }
  if (p.poolSize < p.unitPrice) {
    return { valid: false, error: "Tokenisation pool cannot be less than the price per token." };
  }
  if (
    p.indicativeValue !== undefined &&
    p.indicativeValue > 0 &&
    p.poolSize !== undefined &&
    p.poolSize > p.indicativeValue
  ) {
    return {
      valid: false,
      error: "Proposed tokenisation pool cannot exceed the indicative market value.",
    };
  }

  return { valid: true };
}

/**
 * Save a newly created demo property
 */
export function saveUserProperty(prop: Property): SavePropertyResult {
  ensureHydrated();
  const validation = validatePropertyRecord(prop, false);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const enriched: Property = {
    ...prop,
    id: prop.id.trim(),
    name: prop.name.trim(),
    location: prop.location.trim(),
    isUserCreated: true,
    createdAt: prop.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updated = [enriched, ...memoryUserProperties];
  const ok = saveToStorage(updated);
  if (ok) {
    addActivity({
      kind: "Status update",
      propertyId: enriched.id,
      detail: `Demo property "${enriched.name}" saved locally with ${enriched.docs.length} document(s)`,
      source: "demo",
    });
    return { success: true, property: enriched };
  }
  return { success: false, error: "Failed to persist property to local storage." };
}

/**
 * Update an existing user demo property
 */
export function updateUserProperty(id: string, updates: Partial<Property>): SavePropertyResult {
  ensureHydrated();
  if (isSampleProperty(id)) {
    return { success: false, error: "Sample properties cannot be edited." };
  }

  const index = memoryUserProperties.findIndex(
    (p) => p.id.toLowerCase() === id.trim().toLowerCase(),
  );
  if (index === -1) {
    return { success: false, error: `Property with ID "${id}" was not found.` };
  }

  const current = memoryUserProperties[index]!;
  const merged: Property = {
    ...current,
    ...updates,
    id: current.id, // ID cannot be mutated on edit
    isUserCreated: true,
    updatedAt: new Date().toISOString(),
  };

  const validation = validatePropertyRecord(merged, true);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const copy = [...memoryUserProperties];
  copy[index] = merged;
  const ok = saveToStorage(copy);
  if (ok) {
    addActivity({
      kind: "Status update",
      propertyId: merged.id,
      detail: `Demo property "${merged.name}" updated locally`,
      source: "demo",
    });
    return { success: true, property: merged };
  }
  return { success: false, error: "Failed to update property in local storage." };
}

/**
 * Delete a user demo property with safety checks
 */
export function deleteUserProperty(id: string): { success: boolean; error?: string } {
  ensureHydrated();
  if (isSampleProperty(id)) {
    return { success: false, error: "Cannot delete seeded sample properties." };
  }

  const exists = memoryUserProperties.some((p) => p.id.toLowerCase() === id.trim().toLowerCase());
  if (!exists) {
    return { success: false, error: `Property with ID "${id}" was not found.` };
  }

  const filtered = memoryUserProperties.filter(
    (p) => p.id.toLowerCase() !== id.trim().toLowerCase(),
  );
  const ok = saveToStorage(filtered);
  if (ok) {
    addActivity({
      kind: "Status update",
      propertyId: id,
      detail: `Demo property "${id}" deleted from local records`,
      source: "demo",
    });
    return { success: true };
  }
  return { success: false, error: "Failed to delete property from local storage." };
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

const getServerAllProperties = () => PROPERTIES;
const getServerUserProperties = () => EMPTY_USER_PROPERTIES;

/**
 * React hook to subscribe to all properties (user + sample) with guaranteed reference stability.
 */
export function useAllProperties(): Property[] {
  ensureHydrated();
  return useSyncExternalStore(subscribe, getAllProperties, getServerAllProperties);
}

/**
 * React hook to subscribe to user-created demo properties with guaranteed reference stability.
 */
export function useUserProperties(): Property[] {
  ensureHydrated();
  return useSyncExternalStore(subscribe, getUserProperties, getServerUserProperties);
}

/**
 * Clears user demo properties (primarily for testing)
 */
export function clearUserPropertiesForTesting() {
  updateState(EMPTY_USER_PROPERTIES);
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  notify();
}
