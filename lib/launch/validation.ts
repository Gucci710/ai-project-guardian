export type Schema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  minLength?: number;
};

export class ValidationError extends Error {}

export function validate<T>(value: unknown, schema: Schema, path = "入力"): T {
  const fail = () => { throw new ValidationError(`${path}の形式または範囲が不正です。`); };
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail();
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) fail();
    for (const [key, child] of Object.entries(schema.properties ?? {})) validate(record[key], child, `${path}.${key}`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) fail();
    const array = value as unknown[];
    if (array.length < (schema.minItems ?? 0) || array.length > (schema.maxItems ?? 100)) fail();
    for (const child of array) validate(child, schema.items!, path);
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.trim().length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? 30000)) fail();
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") fail();
  } else {
    if (typeof value !== "number" || !Number.isFinite(value) || value < (schema.minimum ?? 0) || value > (schema.maximum ?? Infinity) || (schema.type === "integer" && !Number.isInteger(value))) fail();
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) fail();
  return value as T;
}
