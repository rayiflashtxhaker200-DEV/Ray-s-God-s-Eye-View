/**
 * Validates tool arguments against the JSON Schema subset tool definitions use:
 * object, array, string, number, integer and boolean types; required,
 * properties, additionalProperties, items, enum, minimum, maximum, minLength,
 * maxLength, pattern, minItems and maxItems. Unsupported keywords are rejected when a
 * tool is defined, so a schema can never promise checks that are not made.
 */

const KEYWORDS = new Set([
  'type',
  'description',
  'title',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'default',
]);
const TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);

function matchesType(type, value) {
  switch (type) {
    case 'object':
      return (
        value !== null && typeof value === 'object' && !Array.isArray(value)
      );
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Number.isInteger(value)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

/** Throw when a schema uses a keyword or type this validator does not check. */
export function assertSupportedSchema(schema, path = 'schema') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new TypeError(`${path} must be an object`);
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key))
      throw new TypeError(`${path} uses unsupported keyword ${key}`);
  }
  const typeList = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (
    !typeList.length ||
    typeList.some((entry) => typeof entry !== 'string' || !TYPES.has(entry))
  )
    throw new TypeError(`${path} has unsupported type ${schema.type}`);
  if (schema.pattern !== undefined) new RegExp(schema.pattern, 'u');
  // Only the boolean form is checked; a schema here would go unenforced.
  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties !== 'boolean'
  )
    throw new TypeError(`${path}.additionalProperties must be true or false`);
  for (const [name, child] of Object.entries(schema.properties || {}))
    assertSupportedSchema(child, `${path}.${name}`);
  if (schema.items) assertSupportedSchema(schema.items, `${path}[]`);
}

/**
 * Return a list of problems with a value, empty when it conforms. Messages
 * name the argument path so a model can correct its call.
 */
export function validateValue(schema, value, path = 'arguments') {
  const problems = [];
  const fail = (message) => problems.push(`${path} ${message}`);
  const typeList = Array.isArray(schema.type) ? schema.type : [schema.type];
  const activeType = typeList.find((type) => matchesType(type, value));
  if (!activeType) {
    if (
      typeList.length === 1 &&
      typeList[0] === 'integer' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      fail('must be an integer');
    } else if (
      typeList.length === 1 &&
      ['number', 'integer'].includes(typeList[0])
    ) {
      fail('must be a number');
    } else if (typeList.length === 1) {
      const expected = {
        array: 'an array',
        boolean: 'true or false',
        null: 'null',
        object: 'an object',
        string: 'a string',
      }[typeList[0]];
      fail(`must be ${expected || typeList[0]}`);
    } else {
      fail(`must be ${typeList.join(' or ')}`);
    }
  } else
    switch (activeType) {
      case 'null':
        break;
      case 'object': {
        for (const name of schema.required || []) {
          if (!Object.hasOwn(value, name) || value[name] === undefined)
            fail(`is missing ${name}`);
        }
        // Own properties only, so names such as constructor or __proto__ are
        // not mistaken for declared ones.
        const properties = schema.properties || {};
        for (const [name, child] of Object.entries(value)) {
          if (Object.hasOwn(properties, name))
            problems.push(
              ...validateValue(properties[name], child, `${path}.${name}`),
            );
          else if (schema.additionalProperties === false)
            fail(`has unknown property ${name}`);
        }
        break;
      }
      case 'array':
        if (schema.minItems != null && value.length < schema.minItems)
          fail(`must have at least ${schema.minItems} items`);
        if (schema.maxItems != null && value.length > schema.maxItems)
          fail(`must have at most ${schema.maxItems} items`);
        if (schema.items)
          value.forEach((item, index) =>
            problems.push(
              ...validateValue(schema.items, item, `${path}[${index}]`),
            ),
          );
        break;
      case 'string':
        if (schema.minLength != null || schema.maxLength != null) {
          // Code points, as JSON Schema counts. Counting stops once both bounds
          // are decided, so a huge argument costs no more than its limit.
          const limit = Math.max(
            schema.minLength ?? 0,
            schema.maxLength != null ? schema.maxLength + 1 : 0,
          );
          let length = 0;
          for (const _ of value) if (++length >= limit) break;
          if (schema.minLength != null && length < schema.minLength)
            fail(`must be at least ${schema.minLength} characters`);
          if (schema.maxLength != null && length > schema.maxLength)
            fail(`must be at most ${schema.maxLength} characters`);
        }
        if (
          schema.pattern !== undefined &&
          !new RegExp(schema.pattern, 'u').test(value)
        )
          fail(`must match ${schema.pattern}`);
        break;
      case 'number':
      case 'integer':
        if (schema.minimum != null && value < schema.minimum)
          fail(`must be at least ${schema.minimum}`);
        if (schema.maximum != null && value > schema.maximum)
          fail(`must be at most ${schema.maximum}`);
        break;
      case 'boolean':
        break;
    }
  if (schema.enum && !schema.enum.includes(value))
    fail(
      `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`,
    );
  return problems;
}
