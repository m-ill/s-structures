export const DXF_ENTITIES_VERSION = 'p3-m6-dxf-entities';

export function dxfEntitiesToGeometry(parsed) {
  const blocks = collectBlocks(parsed?.sections?.BLOCKS?.pairs || []);
  const entities = collectEntities(parsed?.sections?.ENTITIES?.pairs || []);
  const out = collectGeometry(entities, blocks);

  return {
    version: DXF_ENTITIES_VERSION,
    segments: out.segments.filter(Boolean),
    points: out.points.filter(Boolean),
    texts: out.texts.filter(Boolean),
    audit: {
      counts: countByType(entities),
      ignored: out.ignored,
      blocks: Object.keys(blocks).sort(),
    },
  };
}

function collectEntities(pairs) {
  const entities = [];
  let current = null;
  let polyline = null;
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair.code === 0) {
      if (pair.value === 'POLYLINE') {
        if (current) entities.push(current);
        polyline = { type: 'POLYLINE', pairs: [], vertices: [], layer: '0' };
        current = polyline;
        continue;
      }
      if (pair.value === 'VERTEX' && polyline) {
        const vertexPairs = [];
        for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j += 1) vertexPairs.push(pairs[j]);
        polyline.vertices.push({ type: 'VERTEX', pairs: vertexPairs, layer: polyline.layer });
        continue;
      }
      if (pair.value === 'SEQEND' && polyline) {
        entities.push(polyline);
        polyline = null;
        current = null;
        continue;
      }
      if (current) entities.push(current);
      current = { type: pair.value, pairs: [], layer: '0' };
    } else if (current) {
      current.pairs.push(pair);
      if (pair.code === 8) current.layer = String(pair.value);
    }
  }
  if (current) entities.push(current);
  return entities.filter((entity) => !['SEQEND', 'VERTEX', 'ENDBLK'].includes(entity.type));
}

function collectBlocks(pairs) {
  const blocks = {};
  let currentName = null;
  let currentPairs = [];
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair.code === 0 && pair.value === 'BLOCK') {
      currentName = null;
      currentPairs = [];
    } else if (pair.code === 2 && currentName == null) {
      currentName = String(pair.value);
    } else if (pair.code === 0 && pair.value === 'ENDBLK') {
      if (currentName) blocks[currentName] = collectEntities(currentPairs);
      currentName = null;
      currentPairs = [];
    } else if (currentName != null) {
      currentPairs.push(pair);
    }
  }
  return blocks;
}

function collectGeometry(entities, blocks = {}, transform = identityTransform()) {
  const out = { segments: [], points: [], texts: [], ignored: {} };
  for (const entity of entities) {
    if (entity.type === 'LINE') out.segments.push(transformSegment(lineSegment(entity), transform));
    else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') out.segments.push(...polylineSegments(entity).map((segment) => transformSegment(segment, transform)));
    else if (entity.type === 'POINT') out.points.push(transformPointRecord(pointEntity(entity), transform));
    else if (entity.type === 'TEXT' || entity.type === 'MTEXT') out.texts.push(transformTextRecord(textEntity(entity), transform));
    else if (entity.type === 'INSERT') {
      const name = String(valueOf(entity.pairs, 2, ''));
      const children = blocks[name];
      if (!children) {
        out.ignored.INSERT = (out.ignored.INSERT || 0) + 1;
        continue;
      }
      const nested = collectGeometry(children, blocks, composeTransform(transform, insertTransform(entity)));
      out.segments.push(...nested.segments);
      out.points.push(...nested.points);
      out.texts.push(...nested.texts);
      mergeIgnored(out.ignored, nested.ignored);
    } else {
      out.ignored[entity.type] = (out.ignored[entity.type] || 0) + 1;
    }
  }
  return out;
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
  } else {
    for (const vertex of entity.vertices || []) vertices.push(pointFromCodes(vertex.pairs, 10, 20, 30));
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

function identityTransform() {
  return { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1, rotation: 0 };
}

function insertTransform(entity) {
  const sx = Number(valueOf(entity.pairs, 41, 1)) || 1;
  const sy = Number(valueOf(entity.pairs, 42, sx)) || sx;
  const sz = Number(valueOf(entity.pairs, 43, 1)) || 1;
  return {
    x: Number(valueOf(entity.pairs, 10, 0)) || 0,
    y: Number(valueOf(entity.pairs, 20, 0)) || 0,
    z: Number(valueOf(entity.pairs, 30, 0)) || 0,
    sx,
    sy,
    sz,
    rotation: Number(valueOf(entity.pairs, 50, 0)) || 0,
  };
}

function composeTransform(parent, child) {
  const p = applyPoint({ x: child.x, y: child.y, z: child.z }, parent);
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    sx: parent.sx * child.sx,
    sy: parent.sy * child.sy,
    sz: parent.sz * child.sz,
    rotation: parent.rotation + child.rotation,
  };
}

function transformSegment(segment, transform) {
  return { ...segment, from: applyPoint(segment.from, transform), to: applyPoint(segment.to, transform) };
}

function transformPointRecord(record, transform) {
  return { ...record, point: applyPoint(record.point, transform) };
}

function transformTextRecord(record, transform) {
  return { ...record, point: applyPoint(record.point, transform) };
}

function applyPoint(point, transform) {
  const angle = (transform.rotation || 0) * Math.PI / 180;
  const x = point.x * transform.sx;
  const y = point.y * transform.sy;
  return {
    x: transform.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: transform.y + x * Math.sin(angle) + y * Math.cos(angle),
    z: transform.z + point.z * transform.sz,
  };
}

function mergeIgnored(target, source) {
  for (const [key, value] of Object.entries(source || {})) target[key] = (target[key] || 0) + value;
}
