import {
  enumValuesFromSchemaProperty,
  formatConfigLabel,
  isAdvancedConfigField,
  isRecord,
  schemaFieldTypeFromValue,
  type ConfigField,
  type ConfigFieldType,
} from "./workflowConfigFieldBasics";

function schemaPropertyFieldType(property: Record<string, unknown>): ConfigFieldType {
  if (enumValuesFromSchemaProperty(property)?.length) return "enum";

  const type = Array.isArray(property.type) ? property.type[0] : property.type;
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "string") return "string";
  return "json";
}

export function schemaFieldsFromRecordSchema(schema: unknown): ConfigField[] {
  if (!isRecord(schema)) return [];

  const candidateSchema =
    isRecord(schema.properties) || Array.isArray(schema.required)
      ? schema
      : isRecord(schema.schema)
        ? schema.schema
        : isRecord(schema.parameters)
          ? schema.parameters
          : schema;

  if (isRecord(candidateSchema.properties)) {
    const requiredKeys = new Set(
      Array.isArray(candidateSchema.required)
        ? candidateSchema.required.map((key) => String(key))
        : []
    );

    return Object.entries(candidateSchema.properties).map(([key, rawProperty]) => {
      const property = isRecord(rawProperty) ? rawProperty : {};
      const enumValues = enumValuesFromSchemaProperty(property);
      const type = schemaPropertyFieldType(property);

      return {
        key,
        label: typeof property.title === "string" ? property.title : formatConfigLabel(key),
        type,
        required: requiredKeys.has(key),
        advanced: isAdvancedConfigField(key, type),
        defaultValue: property.default,
        description: typeof property.description === "string" ? property.description : undefined,
        enumValues,
      };
    });
  }

  const directPropertyEntries = Object.entries(candidateSchema).filter(([key, value]) =>
    key !== "required" &&
    isRecord(value) &&
    (
      typeof value.type === "string" ||
      Array.isArray(value.enum) ||
      Array.isArray(value.options) ||
      value.default !== undefined ||
      typeof value.description === "string"
    )
  );

  if (directPropertyEntries.length) {
    const requiredKeys = new Set(
      Array.isArray(candidateSchema.required)
        ? candidateSchema.required.map((key) => String(key))
        : []
    );

    return directPropertyEntries.map(([key, rawProperty]) => {
      const property = rawProperty as Record<string, unknown>;
      const enumValues = enumValuesFromSchemaProperty(property);
      const type = schemaPropertyFieldType(property);

      return {
        key,
        label: typeof property.title === "string" ? property.title : formatConfigLabel(key),
        type,
        required: property.required === true || requiredKeys.has(key),
        advanced: isAdvancedConfigField(key, type),
        defaultValue: property.default,
        description: typeof property.description === "string" ? property.description : undefined,
        enumValues,
      };
    });
  }

  const fieldList =
    Array.isArray(candidateSchema.fields)
      ? candidateSchema.fields
      : Array.isArray(candidateSchema.inputs)
        ? candidateSchema.inputs
        : Array.isArray(candidateSchema.parameters)
          ? candidateSchema.parameters
          : [];

  return fieldList.flatMap((rawField) => {
    if (!isRecord(rawField)) return [];
    const keyValue = rawField.key ?? rawField.name ?? rawField.id;
    if (typeof keyValue !== "string" || !keyValue) return [];

    const enumValues = enumValuesFromSchemaProperty(rawField);
    const type =
      enumValues?.length
        ? "enum"
        : rawField.type === "number" || rawField.type === "integer"
          ? "number"
          : rawField.type === "boolean"
            ? "boolean"
            : rawField.type === "string"
              ? "string"
              : schemaFieldTypeFromValue(rawField.default);

    return [
      {
        key: keyValue,
        label: typeof rawField.label === "string" ? rawField.label : formatConfigLabel(keyValue),
        type,
        required: rawField.required === true,
        advanced: isAdvancedConfigField(keyValue, type),
        defaultValue: rawField.default,
        description: typeof rawField.description === "string" ? rawField.description : undefined,
        enumValues,
      },
    ];
  });
}
