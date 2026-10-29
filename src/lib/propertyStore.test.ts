import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUserPropertiesForTesting,
  deleteUserProperty,
  generatePropertyId,
  getAllProperties,
  getPropertyById,
  getUserProperties,
  isSampleProperty,
  saveUserProperty,
  updateUserProperty,
  useAllProperties,
  useUserProperties,
  validatePropertyRecord,
} from "./propertyStore";
import { PROPERTIES, type Property } from "./data";

describe("propertyStore local persistence", () => {
  beforeEach(() => {
    clearUserPropertiesForTesting();
  });

  const validProperty: Property = {
    id: "PRP-DEMO-9999",
    name: "Skyline Residency 401",
    location: "Kalyani Nagar, Pune, Maharashtra",
    kind: "Residential apartment",
    propertyType: "residential",
    description: "Modern luxury 3BHK unit",
    image: "/assets/prop1.jpg",
    indicativeValue: 15_000_000,
    poolSize: 10_000_000,
    unitPrice: 1_000,
    monthlyRent: 50_000,
    vacancyPct: 5,
    monthlyOperating: 4_000,
    monthlyMaintenance: 3_500,
    capRatePct: 6,
    maxSupply: 10_000,
    docs: [
      {
        id: "D1",
        category: "Sale deed / title",
        type: "Registered sale deed",
        reference: "SD-2024-999",
        date: "2024-01-01",
        status: "Reviewed",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    ],
  };

  it("identifies sample properties and protects them from overwrite or deletion", () => {
    expect(isSampleProperty("PRP-PUN-0142")).toBe(true);
    expect(isSampleProperty("prp-pun-0142")).toBe(true);
    expect(isSampleProperty("PRP-DEMO-9999")).toBe(false);

    const deleteResult = deleteUserProperty("PRP-PUN-0142");
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain("seeded sample properties");

    const overwriteAttempt: Property = {
      ...validProperty,
      id: "PRP-PUN-0142",
    };
    const saveResult = saveUserProperty(overwriteAttempt);
    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toContain("seeded sample properties");
  });

  it("validates fields rejecting negative values, zero prices, and invalid IDs", () => {
    expect(validatePropertyRecord({ ...validProperty, id: "" }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, name: "" }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, indicativeValue: -100 }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, monthlyRent: -500 }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, vacancyPct: 105 }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, vacancyPct: -5 }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, unitPrice: 0 }).valid).toBe(false);
    expect(validatePropertyRecord({ ...validProperty, poolSize: 500, unitPrice: 1000 }).valid).toBe(
      false,
    );
    expect(validatePropertyRecord({ ...validProperty, capRatePct: -2 }).valid).toBe(false);
    // Reject pool exceeding market value
    expect(
      validatePropertyRecord({
        ...validProperty,
        indicativeValue: 8_000_000,
        poolSize: 9_000_000,
      }).valid,
    ).toBe(false);
  });

  it("validates flexible amounts: market value ₹80,00,001, pool ₹20,19,017, unit price ₹1,001", () => {
    const customProperty: Property = {
      ...validProperty,
      id: "PRP-DEMO-8001",
      indicativeValue: 8_000_001,
      poolSize: 2_019_017,
      unitPrice: 1_001,
      maxSupply: 2017,
    };
    const validation = validatePropertyRecord(customProperty);
    expect(validation.valid).toBe(true);

    const saveRes = saveUserProperty(customProperty);
    expect(saveRes.success).toBe(true);
    expect(saveRes.property?.indicativeValue).toBe(8_000_001);
    expect(saveRes.property?.poolSize).toBe(2_019_017);
    expect(saveRes.property?.unitPrice).toBe(1_001);
  });

  it("saves a valid user property and makes it retrievable", () => {
    const saveRes = saveUserProperty(validProperty);
    expect(saveRes.success).toBe(true);
    expect(saveRes.property?.isUserCreated).toBe(true);

    const userProps = getUserProperties();
    expect(userProps.length).toBe(1);
    expect(userProps[0]?.id).toBe("PRP-DEMO-9999");

    const retrieved = getPropertyById("PRP-DEMO-9999");
    expect(retrieved?.name).toBe("Skyline Residency 401");

    // Case-insensitive lookup
    const retrievedLower = getPropertyById("prp-demo-9999");
    expect(retrievedLower?.id).toBe("PRP-DEMO-9999");

    const allProps = getAllProperties();
    expect(allProps.length).toBe(PROPERTIES.length + 1);
    expect(allProps[0]?.id).toBe("PRP-DEMO-9999");
  });

  it("rejects duplicate user property IDs on create", () => {
    saveUserProperty(validProperty);
    const dupRes = saveUserProperty({
      ...validProperty,
      name: "Another name with same ID",
    });
    expect(dupRes.success).toBe(false);
    expect(dupRes.error).toContain("already exists");
  });

  it("updates an existing user property", () => {
    saveUserProperty(validProperty);
    const updateRes = updateUserProperty("PRP-DEMO-9999", {
      name: "Updated Skyline Residency",
      monthlyRent: 55_000,
    });
    expect(updateRes.success).toBe(true);

    const updated = getPropertyById("PRP-DEMO-9999");
    expect(updated?.name).toBe("Updated Skyline Residency");
    expect(updated?.monthlyRent).toBe(55_000);
  });

  it("deletes a user property and updates the list", () => {
    saveUserProperty(validProperty);
    expect(getUserProperties().length).toBe(1);

    const delRes = deleteUserProperty("PRP-DEMO-9999");
    expect(delRes.success).toBe(true);
    expect(getUserProperties().length).toBe(0);
    expect(getPropertyById("PRP-DEMO-9999")).toBeUndefined();
  });

  it("generates unique property IDs that do not collide with sample properties", () => {
    const id = generatePropertyId();
    expect(id).toMatch(/^PRP-DEMO-\d+$/);
    expect(isSampleProperty(id)).toBe(false);
  });

  it("guarantees referential stability for useSyncExternalStore to prevent render loops", () => {
    const { result, rerender } = renderHook(() => {
      const all = useAllProperties();
      const user = useUserProperties();
      return { all, user };
    });

    const firstAll = result.current.all;
    const firstUser = result.current.user;

    // Multiple re-renders without store change must return identical object reference
    rerender();
    rerender();
    rerender();

    expect(result.current.all).toBe(firstAll);
    expect(result.current.user).toBe(firstUser);
  });
});
