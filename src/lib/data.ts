export * from "./sampleProperties";
import { getPropertyById } from "./propertyStore";
import { PROPERTIES } from "./sampleProperties";

export function getProperty(id: string) {
  return getPropertyById(id) ?? PROPERTIES.find((p) => p.id === id);
}
