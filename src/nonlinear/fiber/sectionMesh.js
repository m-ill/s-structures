import { stableHash } from '../../core/stableHash.js';

export const FIBER_SECTION_MESH_VERSION = 'p8-m6-fiber-section-mesh-v1';

const SI_UNITS = Object.freeze({
  length: 'm',
  area: 'm2',
  secondMoment: 'm4',
  coordinateSystem: 'section-local-yz',
  inertiaConvention: 'Iy=int(z^2)dA, Iz=int(y^2)dA, Iyz=int(y*z)dA',
});

export function buildFiberSectionMesh(sectionSnapshot = {}, options = {}) {
  const source = normalizeSource(sectionSnapshot, options);
  if (source.shape === 'H' || source.shape === 'BOX' || source.shape === 'PIPE') {
    return buildSteelSectionMesh(sectionSnapshot, options);
  }
  if (source.shape === 'RECT' || source.shape === 'SQUARE') {
    const kind = clean(options.kind || sectionSnapshot.materialKind || sectionSnapshot.analysisProfiles?.fiber?.kind).toLowerCase();
    if (kind !== 'rc' && kind !== 'concrete' && !options.reinforcementSnapshot) {
      throw meshError('FIBER_RC_KIND_REQUIRED', 'RECT/SQUARE fiber generation requires kind=rc or a reinforcement snapshot.');
    }
    return buildRcRectSectionMesh(sectionSnapshot, options);
  }
  throw meshError('FIBER_SECTION_SHAPE_UNSUPPORTED', `Unsupported fiber section shape ${source.shape || '(missing)'}.`);
}

export function buildSteelSectionMesh(sectionSnapshot = {}, options = {}) {
  const source = normalizeSource(sectionSnapshot, options);
  if (!['H', 'BOX', 'PIPE'].includes(source.shape)) {
    throw meshError('FIBER_STEEL_SHAPE_UNSUPPORTED', `Steel fiber mesh does not support ${source.shape || '(missing)'}.`);
  }
  const refinement = normalizeRefinement(options.refinement, options.maxCellSize, options.maxCellSizeUnit);
  const materialId = requiredId(options.materialId || sectionSnapshot.materialId || 'steel', 'steel material');
  const fibers = [];
  if (source.shape === 'H') meshH(source.params, refinement, materialId, fibers);
  if (source.shape === 'BOX') meshBox(source.params, refinement, materialId, fibers);
  if (source.shape === 'PIPE') meshPipe(source.params, refinement, materialId, fibers);
  return finishMesh({
    family: 'steel',
    source,
    refinement,
    fibers,
    materialIds: { steel: materialId },
    qualification: normalizeQualification(options.qualification || sectionSnapshot.qualification || 'candidate'),
    topology: steelTopology(source.shape, fibers),
  });
}

export function buildRcRectSectionMesh(sectionSnapshot = {}, options = {}) {
  const source = normalizeSource(sectionSnapshot, options);
  if (!['RECT', 'SQUARE'].includes(source.shape)) {
    throw meshError('FIBER_RC_SHAPE_UNSUPPORTED', `RC fiber mesh does not support ${source.shape || '(missing)'}.`);
  }
  const refinement = normalizeRefinement(options.refinement, options.maxCellSize, options.maxCellSizeUnit);
  const reinforcement = normalizeReinforcement(
    options.reinforcementSnapshot || sectionSnapshot.reinforcementSnapshot,
    source,
  );
  const materialIds = {
    cover: requiredId(options.materialIds?.cover || reinforcement.materialIds.cover || 'concrete-cover', 'cover material'),
    core: requiredId(options.materialIds?.core || reinforcement.materialIds.core || 'concrete-core', 'core material'),
    rebar: requiredId(options.materialIds?.rebar || reinforcement.materialIds.rebar || 'rebar-steel', 'rebar material'),
  };
  const fibers = meshRcRect(source.params, reinforcement, refinement, materialIds);
  const qualification = normalizeQualification(reinforcement.qualification);
  return finishMesh({
    family: 'reinforced-concrete',
    source,
    refinement,
    fibers,
    materialIds,
    reinforcementSnapshot: reinforcement.snapshot,
    qualification,
    topology: {
      regions: ['cover', 'core', 'bar'],
      overlapPolicy: 'equivalent-square-rebar-replaces-concrete',
      cover: reinforcement.cover,
      barCount: reinforcement.bars.length,
      confinement: clone(reinforcement.confinement),
      designEligible: qualification === 'verified',
      qualificationReason: qualification === 'verified' ? null : 'REINFORCEMENT_SNAPSHOT_NOT_VERIFIED',
    },
  });
}

export function summarizeFiberMesh(fibers = []) {
  validateFibers(fibers);
  const A = fibers.reduce((sum, fiber) => sum + fiber.area, 0);
  if (!(A > 0)) throw meshError('FIBER_MESH_AREA_INVALID', 'Fiber mesh area must be positive.');
  const centroidY = fibers.reduce((sum, fiber) => sum + fiber.area * fiber.y, 0) / A;
  const centroidZ = fibers.reduce((sum, fiber) => sum + fiber.area * fiber.z, 0) / A;
  const origin = fibers.reduce((sum, fiber) => ({
    Iy: sum.Iy + fiber.integration.IyOrigin,
    Iz: sum.Iz + fiber.integration.IzOrigin,
    Iyz: sum.Iyz + fiber.integration.IyzOrigin,
  }), { Iy: 0, Iz: 0, Iyz: 0 });
  const exact = {
    A,
    area: A,
    centroidY,
    centroidZ,
    centroid: { y: centroidY, z: centroidZ },
    Iy: origin.Iy - A * centroidZ ** 2,
    Iz: origin.Iz - A * centroidY ** 2,
    Iyz: origin.Iyz - A * centroidY * centroidZ,
  };
  const point = {
    Iy: fibers.reduce((sum, fiber) => sum + fiber.area * (fiber.z - centroidZ) ** 2, 0),
    Iz: fibers.reduce((sum, fiber) => sum + fiber.area * (fiber.y - centroidY) ** 2, 0),
    Iyz: fibers.reduce((sum, fiber) => sum + fiber.area * (fiber.y - centroidY) * (fiber.z - centroidZ), 0),
  };
  return deepFreeze({
    ...exact,
    fiberCount: fibers.length,
    materialIds: [...new Set(fibers.map((fiber) => fiber.materialId))].sort(),
    materialAreas: totals(fibers, 'materialId'),
    regionAreas: totals(fibers, 'region'),
    pointIntegration: point,
    bounds: {
      minY: Math.min(...fibers.map((fiber) => fiber.bounds.minY)),
      maxY: Math.max(...fibers.map((fiber) => fiber.bounds.maxY)),
      minZ: Math.min(...fibers.map((fiber) => fiber.bounds.minZ)),
      maxZ: Math.max(...fibers.map((fiber) => fiber.bounds.maxZ)),
    },
  });
}

export function validateFiberSectionMesh(mesh = {}) {
  const errors = [];
  if (mesh.version !== FIBER_SECTION_MESH_VERSION) errors.push('version');
  if (!mesh.geometryHash) errors.push('geometryHash');
  if (!mesh.sourceSnapshot || !mesh.sourceSnapshotHash) errors.push('sourceSnapshot');
  try {
    validateFibers(mesh.fibers || []);
  } catch (error) {
    errors.push(error.code || 'fibers');
  }
  const summary = mesh.fibers?.length ? summarizeFiberMesh(mesh.fibers) : null;
  if (summary && mesh.summary && !close(summary.A, mesh.summary.A, 1e-12)) errors.push('summary.A');
  return deepFreeze({ ok: errors.length === 0, errors: [...new Set(errors)] });
}

function meshH(params, refinement, materialId, fibers) {
  const { H, B, tw, tf } = requireGeometry('H', params, ['H', 'B', 'tw', 'tf']);
  if (2 * tf >= H) throw meshError('FIBER_GEOMETRY_OVERLAP', 'H-section flanges overlap.');
  if (tw >= B) throw meshError('FIBER_GEOMETRY_OVERLAP', 'H-section web overlaps the full flange width.');
  const flangeLong = divisionsFor(B, refinement.longitudinal, refinement.maxCellSize);
  const flangeThick = divisionsFor(tf, refinement.thickness, refinement.maxCellSize);
  const webThick = divisionsFor(tw, refinement.thickness, refinement.maxCellSize);
  const webLong = divisionsFor(H - 2 * tf, refinement.longitudinal, refinement.maxCellSize);
  addRectZone(fibers, [H / 2 - tf, H / 2, -B / 2, B / 2], flangeThick, flangeLong, materialId, 'top-flange');
  addRectZone(fibers, [-H / 2, -H / 2 + tf, -B / 2, B / 2], flangeThick, flangeLong, materialId, 'bottom-flange');
  addRectZone(fibers, [-H / 2 + tf, H / 2 - tf, -tw / 2, tw / 2], webLong, webThick, materialId, 'web');
}

function meshBox(params, refinement, materialId, fibers) {
  const { H, B, t } = requireGeometry('BOX', params, ['H', 'B', 't']);
  if (2 * t >= H || 2 * t >= B) throw meshError('FIBER_GEOMETRY_OVERLAP', 'BOX walls overlap.');
  const horizontal = divisionsFor(B, refinement.longitudinal, refinement.maxCellSize);
  const vertical = divisionsFor(H - 2 * t, refinement.longitudinal, refinement.maxCellSize);
  const wall = divisionsFor(t, refinement.thickness, refinement.maxCellSize);
  addRectZone(fibers, [H / 2 - t, H / 2, -B / 2, B / 2], wall, horizontal, materialId, 'top-wall');
  addRectZone(fibers, [-H / 2, -H / 2 + t, -B / 2, B / 2], wall, horizontal, materialId, 'bottom-wall');
  addRectZone(fibers, [-H / 2 + t, H / 2 - t, -B / 2, -B / 2 + t], vertical, wall, materialId, 'left-wall');
  addRectZone(fibers, [-H / 2 + t, H / 2 - t, B / 2 - t, B / 2], vertical, wall, materialId, 'right-wall');
}

function meshPipe(params, refinement, materialId, fibers) {
  const { D, t } = requireGeometry('PIPE', params, ['D', 't']);
  if (2 * t >= D) throw meshError('FIBER_GEOMETRY_OVERLAP', 'PIPE wall thickness reaches or exceeds the radius.');
  const ro = D / 2;
  const ri = ro - t;
  const radialCount = divisionsFor(t, refinement.radial, refinement.maxCellSize);
  const sectorCount = refinement.maxCellSize
    ? Math.max(refinement.sectors, Math.ceil((2 * Math.PI * ro) / refinement.maxCellSize))
    : refinement.sectors;
  for (let radial = 0; radial < radialCount; radial += 1) {
    const r1 = ri + (t * radial) / radialCount;
    const r2 = ri + (t * (radial + 1)) / radialCount;
    for (let sector = 0; sector < sectorCount; sector += 1) {
      const a = (2 * Math.PI * sector) / sectorCount;
      const b = (2 * Math.PI * (sector + 1)) / sectorCount;
      const delta = b - a;
      const area = 0.5 * (r2 ** 2 - r1 ** 2) * delta;
      const angle = (a + b) / 2;
      const radius = (4 * Math.sin(delta / 2) * (r2 ** 3 - r1 ** 3))
        / (3 * delta * (r2 ** 2 - r1 ** 2));
      const radialMoment = (r2 ** 4 - r1 ** 4) / 4;
      const doubleSine = (Math.sin(2 * b) - Math.sin(2 * a)) / 4;
      fibers.push(fiberRecord({
        id: `F${fibers.length + 1}`,
        y: radius * Math.cos(angle),
        z: radius * Math.sin(angle),
        area,
        materialId,
        region: 'wall',
        cellType: 'annular-sector',
        bounds: { minY: -ro, maxY: ro, minZ: -ro, maxZ: ro },
        integration: {
          IyOrigin: radialMoment * (delta / 2 - doubleSine),
          IzOrigin: radialMoment * (delta / 2 + doubleSine),
          IyzOrigin: radialMoment * (Math.sin(b) ** 2 - Math.sin(a) ** 2) / 2,
        },
        metadata: { radial, sector, innerRadius: r1, outerRadius: r2, startAngle: a, endAngle: b },
      }));
    }
  }
}

function meshRcRect(params, reinforcement, refinement, materialIds) {
  const { B, H } = requireGeometry('RECT', params, ['B', 'H']);
  const { left, right, top, bottom } = reinforcement.cover;
  if (left + right >= B || top + bottom >= H) {
    throw meshError('FIBER_GEOMETRY_OVERLAP', 'RC cover consumes the full section.');
  }
  const yCoreMin = -H / 2 + bottom;
  const yCoreMax = H / 2 - top;
  const zCoreMin = -B / 2 + left;
  const zCoreMax = B / 2 - right;
  const yBreaks = [-H / 2, yCoreMin, yCoreMax, H / 2];
  const zBreaks = [-B / 2, zCoreMin, zCoreMax, B / 2];
  for (const bar of reinforcement.bars) {
    yBreaks.push(bar.bounds.minY, bar.bounds.maxY);
    zBreaks.push(bar.bounds.minZ, bar.bounds.maxZ);
  }
  const target = refinement.maxCellSize || Math.min(B, H) / refinement.rcDivisions;
  const ys = refineCoordinates(yBreaks, target);
  const zs = refineCoordinates(zBreaks, target);
  const fibers = [];
  for (let yi = 0; yi < ys.length - 1; yi += 1) {
    for (let zi = 0; zi < zs.length - 1; zi += 1) {
      const minY = ys[yi];
      const maxY = ys[yi + 1];
      const minZ = zs[zi];
      const maxZ = zs[zi + 1];
      const y = (minY + maxY) / 2;
      const z = (minZ + maxZ) / 2;
      if (reinforcement.bars.some((bar) => inside(y, z, bar.bounds))) continue;
      const core = y > yCoreMin - 1e-14 && y < yCoreMax + 1e-14
        && z > zCoreMin - 1e-14 && z < zCoreMax + 1e-14;
      fibers.push(rectFiber({
        id: `F${fibers.length + 1}`,
        minY,
        maxY,
        minZ,
        maxZ,
        materialId: core ? materialIds.core : materialIds.cover,
        region: core ? 'core' : 'cover',
      }));
    }
  }
  for (const bar of reinforcement.bars) {
    fibers.push(fiberRecord({
      id: `B:${bar.id}`,
      y: bar.y,
      z: bar.z,
      area: bar.area,
      materialId: bar.materialId || materialIds.rebar,
      region: 'bar',
      cellType: 'equivalent-square-bar',
      bounds: bar.bounds,
      integration: rectIntegration(bar.bounds),
      metadata: { sourceId: bar.id, diameter: bar.diameter, replacementSide: bar.side },
    }));
  }
  return fibers;
}

function normalizeSource(sectionSnapshot, options) {
  if (!sectionSnapshot || typeof sectionSnapshot !== 'object' || Array.isArray(sectionSnapshot)) {
    throw meshError('FIBER_SECTION_SNAPSHOT_REQUIRED', 'A Phase 7 section snapshot is required.');
  }
  const snapshot = clone(sectionSnapshot);
  const shape = clean(snapshot.shape || snapshot.type).toUpperCase();
  if (!shape) throw meshError('FIBER_SECTION_SHAPE_REQUIRED', 'Section shape is required.');
  const inputLengthUnit = normalizeLengthUnit(
    options.inputLengthUnit
      || snapshot.paramsUnits?.length
      || snapshot.propertyProvenance?.inputUnit
      || snapshot.properties?.provenance?.inputUnit
      || 'mm',
  );
  const raw = snapshot.params || snapshot.dims;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw meshError('FIBER_SECTION_PARAMS_REQUIRED', 'Parametric section dimensions are required.');
  }
  const factor = lengthFactor(inputLengthUnit);
  const params = Object.fromEntries(Object.entries(raw).map(([key, value]) => {
    if (!['H', 'B', 'tw', 'tf', 't', 'D'].includes(key)) return [key, clone(value)];
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      throw meshError('FIBER_GEOMETRY_NONPOSITIVE', `Section parameter ${key} must be finite and positive.`);
    }
    return [key, number * factor];
  }));
  if (shape === 'SQUARE') params.H = params.B;
  return deepFreeze({
    shape,
    params,
    inputLengthUnit,
    snapshot,
    sourceSnapshotHash: stableHash(snapshot),
  });
}

function normalizeReinforcement(input, source) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw meshError('FIBER_REINFORCEMENT_SNAPSHOT_REQUIRED', 'RC fiber generation requires an explicit reinforcement snapshot.');
  }
  const snapshot = clone(input);
  const lengthUnit = normalizeLengthUnit(input.units?.length || source.inputLengthUnit);
  const areaUnit = normalizeAreaUnit(input.units?.area || (lengthUnit === 'mm' ? 'mm2' : 'm2'));
  const lf = lengthFactor(lengthUnit);
  const af = areaFactor(areaUnit);
  const rawCover = input.cover;
  if (rawCover == null) throw meshError('FIBER_RC_COVER_REQUIRED', 'RC cover is required.');
  const cover = typeof rawCover === 'object'
    ? {
      left: positiveLength(rawCover.left ?? rawCover.side, 'cover.left', lf),
      right: positiveLength(rawCover.right ?? rawCover.side, 'cover.right', lf),
      top: positiveLength(rawCover.top, 'cover.top', lf),
      bottom: positiveLength(rawCover.bottom, 'cover.bottom', lf),
    }
    : {
      left: positiveLength(rawCover, 'cover', lf),
      right: positiveLength(rawCover, 'cover', lf),
      top: positiveLength(rawCover, 'cover', lf),
      bottom: positiveLength(rawCover, 'cover', lf),
    };
  if (!Array.isArray(input.bars) || !input.bars.length) {
    throw meshError('FIBER_RC_BARS_REQUIRED', 'At least one explicit reinforcing bar is required.');
  }
  const ids = new Set();
  const bars = input.bars.map((bar, index) => {
    const id = requiredId(bar.id || `bar-${index + 1}`, 'bar');
    if (ids.has(id)) throw meshError('FIBER_GEOMETRY_DUPLICATE', `Duplicate reinforcing bar ID ${id}.`);
    ids.add(id);
    const y = finiteCoordinate(bar.y, `bars[${index}].y`, lf);
    const z = finiteCoordinate(bar.z, `bars[${index}].z`, lf);
    const diameter = bar.diameter == null ? null : positiveLength(bar.diameter, `bars[${index}].diameter`, lf);
    const area = bar.area != null ? positiveArea(bar.area, `bars[${index}].area`, af)
      : diameter != null ? Math.PI * diameter ** 2 / 4 : NaN;
    if (!(area > 0)) throw meshError('FIBER_GEOMETRY_NONPOSITIVE', `Bar ${id} requires a positive area or diameter.`);
    const side = Math.sqrt(area);
    return {
      id,
      y,
      z,
      area,
      diameter,
      side,
      materialId: clean(bar.materialId) || null,
      bounds: { minY: y - side / 2, maxY: y + side / 2, minZ: z - side / 2, maxZ: z + side / 2 },
    };
  });
  const { B, H } = requireGeometry('RECT', source.params, ['B', 'H']);
  for (const bar of bars) {
    if (bar.bounds.minY < -H / 2 - 1e-14 || bar.bounds.maxY > H / 2 + 1e-14
      || bar.bounds.minZ < -B / 2 - 1e-14 || bar.bounds.maxZ > B / 2 + 1e-14) {
      throw meshError('FIBER_BAR_OUTSIDE_SECTION', `Bar ${bar.id} replacement area lies outside the section.`);
    }
  }
  for (let i = 0; i < bars.length; i += 1) {
    for (let j = i + 1; j < bars.length; j += 1) {
      if (rectanglesOverlap(bars[i].bounds, bars[j].bounds)) {
        throw meshError('FIBER_GEOMETRY_DUPLICATE', `Bars ${bars[i].id} and ${bars[j].id} overlap.`);
      }
    }
  }
  return deepFreeze({
    snapshot,
    cover,
    bars,
    confinement: clone(input.confinement || null),
    materialIds: clone(input.materialIds || {}),
    qualification: normalizeQualification(input.qualification || 'preliminary'),
  });
}

function finishMesh(input) {
  validateFibers(input.fibers);
  const summary = summarizeFiberMesh(input.fibers);
  const sourcePropertyAudit = compareSourceProperties(input.source.snapshot, summary);
  const geometryCore = {
    version: FIBER_SECTION_MESH_VERSION,
    shape: input.source.shape,
    params: input.source.params,
    refinement: input.refinement,
    materialIds: input.materialIds,
    reinforcementSnapshot: input.reinforcementSnapshot || null,
    fibers: input.fibers.map(({ id, y, z, area, materialId, region, cellType, bounds }) => ({
      id, y, z, area, materialId, region, cellType, bounds,
    })),
  };
  const mesh = {
    version: FIBER_SECTION_MESH_VERSION,
    contract: '(y,z,area,materialId) fiber cells in explicit SI units',
    family: input.family,
    shape: input.source.shape,
    units: SI_UNITS,
    inputUnits: { sectionLength: input.source.inputLengthUnit },
    sourceSnapshot: input.source.snapshot,
    sourceSnapshotHash: input.source.sourceSnapshotHash,
    geometryHash: stableHash(geometryCore),
    refinement: input.refinement,
    qualification: input.qualification,
    materialIds: input.materialIds,
    reinforcementSnapshot: input.reinforcementSnapshot || null,
    topology: input.topology,
    fibers: input.fibers,
    summary,
    sourcePropertyAudit,
  };
  return deepFreeze(mesh);
}

function addRectZone(fibers, [minY, maxY, minZ, maxZ], requestedY, requestedZ, materialId, region) {
  if (!(maxY > minY && maxZ > minZ)) throw meshError('FIBER_GEOMETRY_NONPOSITIVE', `Region ${region} has nonpositive dimensions.`);
  const nY = Math.max(1, Math.trunc(requestedY));
  const nZ = Math.max(1, Math.trunc(requestedZ));
  for (let iy = 0; iy < nY; iy += 1) {
    for (let iz = 0; iz < nZ; iz += 1) {
      fibers.push(rectFiber({
        id: `F${fibers.length + 1}`,
        minY: minY + ((maxY - minY) * iy) / nY,
        maxY: minY + ((maxY - minY) * (iy + 1)) / nY,
        minZ: minZ + ((maxZ - minZ) * iz) / nZ,
        maxZ: minZ + ((maxZ - minZ) * (iz + 1)) / nZ,
        materialId,
        region,
      }));
    }
  }
}

function rectFiber({ id, minY, maxY, minZ, maxZ, materialId, region }) {
  const bounds = { minY, maxY, minZ, maxZ };
  return fiberRecord({
    id,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
    area: (maxY - minY) * (maxZ - minZ),
    materialId,
    region,
    cellType: 'rectangle',
    bounds,
    integration: rectIntegration(bounds),
  });
}

function rectIntegration(bounds) {
  const { minY, maxY, minZ, maxZ } = bounds;
  return {
    IyOrigin: (maxY - minY) * (maxZ ** 3 - minZ ** 3) / 3,
    IzOrigin: (maxZ - minZ) * (maxY ** 3 - minY ** 3) / 3,
    IyzOrigin: ((maxY ** 2 - minY ** 2) / 2) * ((maxZ ** 2 - minZ ** 2) / 2),
  };
}

function fiberRecord(input) {
  return {
    id: input.id,
    y: input.y,
    z: input.z,
    area: input.area,
    materialId: input.materialId,
    region: input.region,
    cellType: input.cellType,
    bounds: { ...input.bounds },
    integration: { ...input.integration },
    metadata: clone(input.metadata || null),
  };
}

function validateFibers(fibers) {
  if (!Array.isArray(fibers) || !fibers.length) throw meshError('FIBER_MESH_EMPTY', 'Fiber mesh must not be empty.');
  const ids = new Set();
  for (const [index, fiber] of fibers.entries()) {
    if (!clean(fiber.id) || ids.has(fiber.id)) throw meshError('FIBER_GEOMETRY_DUPLICATE', `Fiber ${index} has a missing or duplicate ID.`);
    ids.add(fiber.id);
    for (const key of ['y', 'z', 'area']) {
      if (!Number.isFinite(Number(fiber[key]))) throw meshError('FIBER_GEOMETRY_NONFINITE', `Fiber ${fiber.id} ${key} is nonfinite.`);
    }
    if (!(fiber.area > 0)) throw meshError('FIBER_GEOMETRY_NONPOSITIVE', `Fiber ${fiber.id} area must be positive.`);
    if (!clean(fiber.materialId)) throw meshError('FIBER_MATERIAL_ID_REQUIRED', `Fiber ${fiber.id} material ID is required.`);
    for (const key of ['IyOrigin', 'IzOrigin', 'IyzOrigin']) {
      if (!Number.isFinite(Number(fiber.integration?.[key]))) throw meshError('FIBER_INTEGRATION_INVALID', `Fiber ${fiber.id} ${key} is invalid.`);
    }
  }
}

function normalizeRefinement(input, maxCellSize, maxCellSizeUnit) {
  const source = typeof input === 'number' ? { level: input } : input || {};
  const level = positiveInteger(source.level ?? 1, 'refinement.level', 1, 20);
  const normalizedMax = source.maxCellSize ?? maxCellSize;
  const maxUnit = normalizeLengthUnit(source.units?.length || source.maxCellSizeUnit || maxCellSizeUnit || 'm');
  const maxSize = normalizedMax == null ? null : positiveLength(normalizedMax, 'refinement.maxCellSize', lengthFactor(maxUnit));
  return deepFreeze({
    level,
    longitudinal: positiveInteger(source.longitudinal ?? 8 * level, 'refinement.longitudinal', 1, 1000),
    thickness: positiveInteger(source.thickness ?? 2 * level, 'refinement.thickness', 1, 100),
    sectors: positiveInteger(source.sectors ?? 32 * level, 'refinement.sectors', 8, 4096),
    radial: positiveInteger(source.radial ?? 2 * level, 'refinement.radial', 1, 100),
    rcDivisions: positiveInteger(source.rcDivisions ?? 8 * level, 'refinement.rcDivisions', 2, 1000),
    maxCellSize: maxSize,
    units: { length: 'm' },
  });
}

function requireGeometry(shape, params, keys) {
  const result = {};
  for (const key of keys) {
    const value = Number(params[key]);
    if (!Number.isFinite(value) || !(value > 0)) {
      throw meshError('FIBER_GEOMETRY_MISSING', `${shape} parameter ${key} is required and must be positive.`);
    }
    result[key] = value;
  }
  return result;
}

function compareSourceProperties(snapshot, summary) {
  const source = snapshot.properties || snapshot;
  const rows = {};
  for (const key of ['A', 'Iy', 'Iz', 'Iyz']) {
    const expected = Number(source[key]);
    if (!Number.isFinite(expected)) continue;
    const actual = summary[key];
    rows[key] = {
      expected,
      actual,
      relativeError: Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-30),
    };
  }
  return deepFreeze({
    compared: Object.keys(rows),
    rows,
    consistent: Object.values(rows).every((row) => row.relativeError <= 0.02),
    tolerance: 0.02,
  });
}

function steelTopology(shape, fibers) {
  const regions = [...new Set(fibers.map((fiber) => fiber.region))].sort();
  return {
    regions,
    overlapPolicy: 'disjoint-material-zones',
    cornersIncludedBy: shape === 'BOX' ? ['top-wall', 'bottom-wall'] : null,
    closedWall: shape === 'BOX' || shape === 'PIPE',
  };
}

function totals(rows, key) {
  return Object.fromEntries([...rows.reduce((map, row) => {
    map.set(row[key], (map.get(row[key]) || 0) + row.area);
    return map;
  }, new Map()).entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function refineCoordinates(values, target) {
  const sorted = [...new Set(values.map((value) => rounded(value)))].sort((a, b) => a - b);
  const output = [sorted[0]];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (!(end > start)) throw meshError('FIBER_GEOMETRY_DUPLICATE', 'Duplicate geometry boundary detected.');
    const count = Math.max(1, Math.ceil((end - start) / target));
    for (let step = 1; step <= count; step += 1) output.push(start + ((end - start) * step) / count);
  }
  return output;
}

function divisionsFor(length, requested, maxCellSize) {
  return Math.max(requested, maxCellSize ? Math.ceil(length / maxCellSize) : 1);
}

function inside(y, z, bounds) {
  return y > bounds.minY - 1e-14 && y < bounds.maxY + 1e-14
    && z > bounds.minZ - 1e-14 && z < bounds.maxZ + 1e-14;
}

function rectanglesOverlap(a, b) {
  return Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > 1e-14
    && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > 1e-14;
}

function normalizeLengthUnit(value) {
  const unit = clean(value).toLowerCase();
  if (unit === 'm' || unit === 'mm') return unit;
  throw meshError('FIBER_LENGTH_UNIT_UNSUPPORTED', `Unsupported length unit ${value || '(missing)'}.`);
}

function normalizeAreaUnit(value) {
  const unit = clean(value).toLowerCase().replace('^', '');
  if (unit === 'm2' || unit === 'mm2') return unit;
  throw meshError('FIBER_AREA_UNIT_UNSUPPORTED', `Unsupported area unit ${value || '(missing)'}.`);
}

function lengthFactor(unit) {
  return unit === 'mm' ? 1e-3 : 1;
}

function areaFactor(unit) {
  return unit === 'mm2' ? 1e-6 : 1;
}

function positiveLength(value, path, factor) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw meshError('FIBER_GEOMETRY_NONPOSITIVE', `${path} must be positive.`);
  return number * factor;
}

function positiveArea(value, path, factor) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw meshError('FIBER_GEOMETRY_NONPOSITIVE', `${path} must be positive.`);
  return number * factor;
}

function finiteCoordinate(value, path, factor) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw meshError('FIBER_GEOMETRY_NONFINITE', `${path} must be finite.`);
  return number * factor;
}

function positiveInteger(value, path, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw meshError('FIBER_REFINEMENT_INVALID', `${path} must be an integer in [${minimum}, ${maximum}].`);
  }
  return number;
}

function normalizeQualification(value) {
  const qualification = clean(value).toLowerCase();
  if (!['preliminary', 'assumed', 'candidate', 'verified'].includes(qualification)) {
    throw meshError('FIBER_QUALIFICATION_INVALID', `Unsupported qualification ${value || '(missing)'}.`);
  }
  return qualification;
}

function requiredId(value, label) {
  const id = clean(value);
  if (!id) throw meshError('FIBER_MATERIAL_ID_REQUIRED', `${label} ID is required.`);
  return id;
}

function rounded(value) {
  return Math.round(value * 1e15) / 1e15;
}

function close(a, b, tolerance) {
  return Math.abs(Number(a) - Number(b)) <= tolerance * Math.max(1, Math.abs(Number(a)), Math.abs(Number(b)));
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function meshError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
