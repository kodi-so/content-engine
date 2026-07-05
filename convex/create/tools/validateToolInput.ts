import { getCreateTool } from "./registry";
import type { CreateToolName } from "./types";

type JsonSchema = {
  additionalProperties?: boolean;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string | string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function schemaTypes(schema: JsonSchema) {
  return Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
}

function valueType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function typeMatches(schema: JsonSchema, value: unknown) {
  const types = schemaTypes(schema);
  if (!types.length) return true;
  const actual = valueType(value);
  if (types.includes(actual)) return true;
  return actual === "integer" && types.includes("number");
}

function validateSchemaValue(
  schema: JsonSchema,
  value: unknown,
  path: string
): string[] {
  const errors: string[] = [];
  if (!typeMatches(schema, value)) {
    errors.push(`${path} must be ${schemaTypes(schema).join(" or ")}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.map(String).join(", ")}`);
  }

  if (isRecord(value)) {
    const properties = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not supported`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateSchemaValue(child, value[key], `${path}.${key}`));
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      errors.push(...validateSchemaValue(schema.items!, item, `${path}[${index}]`));
    });
  }

  return errors;
}

export function validateToolCallInput(
  toolName: CreateToolName,
  input: unknown
): string[] {
  const tool = getCreateTool(toolName);
  if (!tool) return [`Unknown tool name: ${toolName}`];
  if (tool.inputSchema.kind !== "json_schema") return [];
  const schema = tool.inputSchema.schema as JsonSchema;
  const value = input ?? {};
  return validateSchemaValue(schema, value, `${toolName}.input`);
}
