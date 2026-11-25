// Conversions for OpenAI-compatible providers (OpenRouter). Pure functions.

import type { Schema } from "@google/genai";

export type JsonSchema = Record<string, unknown>;

/** Gemini schema (Type.OBJECT, nullable…) → standard JSON Schema. */
export function toJsonSchema(schema: Schema): JsonSchema {
  const type = String(schema.type ?? "").toLowerCase();
  const out: JsonSchema = {};
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.nullable ? [...schema.enum, null] : [...schema.enum];
  if (type === "object") {
    const properties = Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [key, toJsonSchema(value)]),
    );
    out.properties = properties;
    out.required = schema.required ?? [];
    out.additionalProperties = false;
  }
  if (type === "array" && schema.items) out.items = toJsonSchema(schema.items);
  if (type) out.type = schema.nullable ? [type, "null"] : type;
  return out;
}

/** JSON from the response: accepts ```json blocks and text around the object. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("Risposta non in formato JSON");
  }
}

