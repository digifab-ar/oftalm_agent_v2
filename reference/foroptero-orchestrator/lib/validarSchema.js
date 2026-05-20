/**
 * Validador JSON Schema mínimo (subset usado por VISTA_*_SCHEMA).
 * @throws {Error} si el objeto no cumple el schema
 */
function tiposSchema(schema) {
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

function coincideTipo(data, t) {
  if (t === 'null') return data === null;
  if (t === 'string') return typeof data === 'string';
  if (t === 'number') return typeof data === 'number' && !Number.isNaN(data);
  if (t === 'boolean') return typeof data === 'boolean';
  if (t === 'object')
    return data !== null && typeof data === 'object' && !Array.isArray(data);
  if (t === 'array') return Array.isArray(data);
  return false;
}

export function validarContraSchema(schema, data, path = 'root') {
  if (!schema || typeof schema !== 'object') {
    throw new Error(`Schema inválido en ${path}`);
  }

  const types = tiposSchema(schema);
  const tipoSimple = types.length === 1 ? types[0] : null;

  if (data === null && types.includes('null')) {
    return;
  }

  if (
    coincideTipo(data, 'object') &&
    (tipoSimple === 'object' || types.includes('object')) &&
    schema.properties
  ) {
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`${path}: se esperaba object`);
    }
    const keys = Object.keys(data);
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties ?? {}));
      for (const k of keys) {
        if (!allowed.has(k)) {
          throw new Error(`${path}: propiedad no permitida "${k}"`);
        }
      }
    }
    for (const req of schema.required ?? []) {
      if (!(req in data)) {
        throw new Error(`${path}: falta propiedad requerida "${req}"`);
      }
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (key in data) {
        validarContraSchema(subSchema, data[key], `${path}.${key}`);
      }
    }
    return;
  }

  if (tipoSimple === 'array' || (types.includes('array') && Array.isArray(data))) {
    if (!Array.isArray(data)) {
      throw new Error(`${path}: se esperaba array`);
    }
    if (schema.items) {
      data.forEach((item, i) =>
        validarContraSchema(schema.items, item, `${path}[${i}]`)
      );
    }
    return;
  }

  const ok = types.some((t) => coincideTipo(data, t));
  if (!ok) {
    throw new Error(`${path}: tipo inválido (esperado ${types.join('|')})`);
  }

  if (schema.enum && !schema.enum.includes(data)) {
    throw new Error(`${path}: valor fuera de enum`);
  }
}
