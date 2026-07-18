import type { Json } from "@/types/database.types";

export function toDatabaseJson(value: unknown): Json {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Database JSON payload is not serializable.");
  }
  return JSON.parse(serialized) as Json;
}
