export const DXF_ENTITIES_VERSION = 'p3-m6-dxf-entities';

export function dxfEntitiesToGeometry(parsed) {
  const pairs = parsed?.sections?.ENTITIES?.pairs || [];
  const entities = collectEntities(pairs);
  const segments = [];
  const points = [];
  const texts = [];
  const ignored = {};

  for (const entity of entities) {
    if (entity.type === 'LINE') segments.push(lineSegment(entity));
    else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') segments.push(...polylineSegments(entity));
    else if (entity.type === 'POINT') points.push(pointEntity(entity));
    else if (entity.type === 'TEXT' || entity.type === 'MTEXT') texts.push(textEntity(entity));
    else ignored[entity.type] = (ignored[entity.type] || 0) + 1;
  }

  return {
    version: DXF_ENTITIES_VERSION,
    segments: segments.filter(Boolean),
    points: points.filter(Boolean),
    texts: texts.filter(Boolean),
    audit: {
      counts: countByType(entities),
      ignored,
    },
  };
}

function collectEntities(pairs) {
  const entities = [];
  let current = null;
  for (const pair of pairs) {
    if (pair.code === 0) {
      if (current) entities.push(current);
      current = { type: pair.value, pairs: [], layer: '0' };
    } else if (current) {
      current.pairs.push(pair);
      if (pair.code === 8) current.layer = String(pair.value);
    }
  }
  if (current) entities.push(current);
  return entities.filter((entity) => !['SEQEND', 'VERTEX'].includes(entity.type));
}

function lineSegment(entity) {
  return {
    from: pointFromCodes(entity.pairs, 10, 20, 30),
    to: pointFromCodes(entity.pairs, 11, 21, 31),
    layer: entity.layer,
  };
}

function polylineSegments(entity) {
  const vertices = [];
  if (entity.type === 'LWPOLYLINE') {
    let current = null;
    for (const pair of entity.pairs) {
      if (pair.code === 10) {
        current = { x: Number(pair.value), y: 0, z: 0 };
        vertices.push(current);
      } else if (current && pair.code === 20) current.y = Number(pair.value);
      else if (current && pair.code === 30) current.z = Number(pair.value);
    }
  }
  return vertices.slice(0, -1).map((from, index) => ({ from, to: vertices[index + 1], layer: entity.layer }));
}

function pointEntity(entity) {
  return { point: pointFromCodes(entity.pairs, 10, 20, 30), layer: entity.layer };
}

function textEntity(entity) {
  return {
    point: pointFromCodes(entity.pairs, 10, 20, 30),
    text: String(valueOf(entity.pairs, 1, '')),
    layer: entity.layer,
  };
}

function pointFromCodes(pairs, xCode, yCode, zCode) {
  return {
    x: Number(valueOf(pairs, xCode, 0)),
    y: Number(valueOf(pairs, yCode, 0)),
    z: Number(valueOf(pairs, zCode, 0)),
  };
}

function valueOf(pairs, code, fallback) {
  return pairs.find((pair) => pair.code === code)?.value ?? fallback;
}

function countByType(entities) {
  return entities.reduce((out, entity) => {
    out[entity.type] = (out[entity.type] || 0) + 1;
    return out;
  }, {});
}
