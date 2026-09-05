import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as verifySignature,
} from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';

export const P17_APPEND_ONLY_RUN_STORE_VERSION = 'p17-m1-append-only-run-store-v1';
export const P17_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/u;
export const P17_RUN_CHAIN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
export const P17_RUN_INTEGRITY_FILE = 'integrity-manifest.json';
export const P17_RUN_COMMIT_LOCK_PREFIX = '.p17-committed-';
export const P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR = 'LOCAL_FRAMEWORK_FIXTURE';
export const P17_EXTERNAL_SIGNED_ANCHOR = 'EXTERNAL_SIGNED_ANCHOR';

export const P17_APPEND_ONLY_ASSURANCE_POLICY = deepFreeze({
  version: 'p17-m1-append-only-assurance-policy-v1',
  storageClass: 'LOCAL_FILESYSTEM_APPEND_ONLY_EVIDENCE',
  localFilesystemWormGuaranteed: false,
  localRehashResistanceGuaranteed: false,
  officialTerminalQualificationRequires: P17_EXTERNAL_SIGNED_ANCHOR,
  localFrameworkFixtureAnchor: P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR,
  fixtureScope: 'P17-M1_RESULT_FREE_FRAMEWORK_FIXTURE',
  tombstonePolicy: {
    marker: `${P17_RUN_COMMIT_LOCK_PREFIX}<runId>.lock`,
    purpose: 'PERSISTENT_COMMIT_OR_CRASH_TOMBSTONE',
    automaticStaleReclaimAllowed: false,
    reusePolicy: 'NEVER_REUSE_AUTOMATICALLY; QUARANTINE_AND_FORENSIC_REVIEW_REQUIRED',
  },
  limitations: [
    'A principal with write access can alter payloads and recompute local hashes.',
    'Read-only mode bits are defense-in-depth and are not hardware or service-enforced WORM custody.',
    'Official terminal qualification requires a signature validated against an externally governed trusted-key registry.',
  ],
});

const INTEGRITY_KEYS = Object.freeze([
  'version',
  'runId',
  'status',
  'createdAt',
  'fileCount',
  'files',
  'chain',
  'custodyAnchor',
  'storagePolicy',
  'integrityHash',
]);

/**
 * Atomically commits a previously prepared set of immutable run documents.
 * No official benchmark run is written by M1; this primitive is exercised only
 * against temporary result-free fixtures until an individual case is runnable.
 */
export async function commitAppendOnlyRun(options = {}) {
  const specification = createAppendOnlyRunCustodyPayload(options);
  const {
    runId,
    status,
    createdAt,
    normalizedDocuments,
    files,
    chain,
    payloadHash,
  } = specification;
  const runsRoot = path.resolve(String(options.runsRoot || ''));
  const custodyAnchor = normalizeCustodyAnchor(options.custodyAnchor, specification, options.trustedExternalAnchorKeys);

  if (!options.allowedRoot) throw storeError('P17_ALLOWED_ROOT_REQUIRED', 'An explicit allowedRoot is required for every append-only commit.');
  await assertSafeDirectory(runsRoot, options.allowedRoot);
  const target = resolveDirectChild(runsRoot, runId, 'P17_RUN_PATH_ESCAPE');
  if (await pathExists(target)) throw storeError('P17_RUN_ALREADY_EXISTS', `Run ${runId} already exists and cannot be overwritten.`);
  const commitLock = resolveDirectChild(runsRoot, `${P17_RUN_COMMIT_LOCK_PREFIX}${runId}.lock`, 'P17_RUN_LOCK_PATH_ESCAPE');

  const stagingName = `.p17-staging-${runId}-${randomUUID()}`;
  const staging = resolveDirectChild(runsRoot, stagingName, 'P17_STAGING_PATH_ESCAPE');
  await mkdir(staging, { recursive: false });
  let committed = false;
  let lockAcquired = false;
  let seal = null;
  const durability = {
    contentFilesSynced: 0,
    integrityManifestSynced: false,
    stagingDirectoriesSynced: false,
    commitLockSynced: false,
    parentDirectorySyncedAfterLock: false,
    parentDirectorySyncedAfterRename: false,
    atomicRenameCompleted: false,
  };
  try {
    try {
      const tombstone = {
        version: P17_APPEND_ONLY_ASSURANCE_POLICY.version,
        runId,
        createdAt,
        purpose: P17_APPEND_ONLY_ASSURANCE_POLICY.tombstonePolicy.purpose,
        automaticStaleReclaimAllowed: false,
      };
      await writeDurableFile(commitLock, Buffer.from(`${canonicalPrettyJson(tombstone)}\n`, 'utf8'), { mode: 0o444 });
      lockAcquired = true;
      durability.commitLockSynced = true;
      durability.parentDirectorySyncedAfterLock = await syncDirectoryBestEffort(runsRoot);
    } catch (error) {
      if (error?.code === 'EEXIST') throw storeError('P17_RUN_ALREADY_EXISTS', `Run ${runId} already has an immutable commit lock.`, error);
      throw error;
    }
    if (await pathExists(target)) throw storeError('P17_RUN_ALREADY_EXISTS', `Run ${runId} already exists and cannot be overwritten.`);
    for (const document of normalizedDocuments) {
      const destination = resolveDescendant(staging, document.path, 'P17_DOCUMENT_PATH_ESCAPE');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeDurableFile(destination, document.bytes);
      durability.contentFilesSynced += 1;
    }

    const integrityCore = {
      version: P17_APPEND_ONLY_RUN_STORE_VERSION,
      runId,
      status,
      createdAt,
      fileCount: files.length,
      files,
      chain,
      custodyAnchor,
      storagePolicy: P17_APPEND_ONLY_ASSURANCE_POLICY,
    };
    const integrity = {
      ...integrityCore,
      integrityHash: canonicalHash(integrityCore),
    };
    const integrityBytes = Buffer.from(`${canonicalPrettyJson(integrity)}\n`, 'utf8');
    await writeDurableFile(path.join(staging, P17_RUN_INTEGRITY_FILE), integrityBytes);
    durability.integrityManifestSynced = true;
    durability.stagingDirectoriesSynced = await syncDirectoryTreeBestEffort(staging);
    seal = await sealTreeReadOnly(staging);

    await rename(staging, target);
    committed = true;
    durability.atomicRenameCompleted = true;
    durability.parentDirectorySyncedAfterRename = await syncDirectoryBestEffort(runsRoot);
    const directoryHash = await hashCommittedDirectory(target, { trustedExternalAnchorKeys: options.trustedExternalAnchorKeys });
    const assurance = buildAssurance(
      status,
      custodyAnchor,
      custodyAnchor.type === P17_EXTERNAL_SIGNED_ANCHOR,
    );
    return Object.freeze({
      version: P17_APPEND_ONLY_RUN_STORE_VERSION,
      runId,
      target,
      commitLock,
      integrity: deepFreeze(integrity),
      directoryHash,
      custodyPayloadHash: payloadHash,
      durability: deepFreeze(durability),
      seal,
      assurance,
      tombstonePolicy: P17_APPEND_ONLY_ASSURANCE_POLICY.tombstonePolicy,
    });
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') {
      throw storeError('P17_RUN_ALREADY_EXISTS', `Run ${runId} already exists and cannot be overwritten.`, error);
    }
    throw error;
  } finally {
    if (!committed) await rm(staging, { recursive: true, force: true }).catch(() => {});
    // Only this live call may roll back the lock it acquired before publication.
    // A lock found on entry is a persistent crash/commit tombstone and is never
    // reclaimed automatically, regardless of age or whether the target exists.
    if (!committed && lockAcquired) await rm(commitLock, { force: true }).catch(() => {});
  }
}

/**
 * Builds the immutable run payload hash that an external custody statement must
 * bind. This function performs no I/O and executes neither adapter nor solver.
 */
export function createAppendOnlyRunCustodyPayload(options = {}) {
  const runId = String(options.runId || '');
  const documents = options.documents;
  const status = String(options.status || 'FRAMEWORK_FIXTURE');
  const createdAt = String(options.createdAt || new Date().toISOString());
  if (!P17_RUN_ID_PATTERN.test(runId)) throw storeError('P17_RUN_ID_INVALID', `Invalid run ID: ${runId || '(empty)'}`);
  if (!plainRecord(documents) || Object.keys(documents).length === 0) {
    throw storeError('P17_RUN_DOCUMENTS_REQUIRED', 'At least one immutable run document is required.');
  }
  if (!/^[A-Z0-9_-]+$/u.test(status)) throw storeError('P17_RUN_STATUS_INVALID', `Invalid run status: ${status || '(empty)'}`);
  assertUtcTimestamp(createdAt, 'P17_RUN_CREATED_AT_INVALID', 'run timestamp');
  const normalizedDocuments = normalizeDocuments(documents);
  const chain = normalizeChain(options.chain);
  const files = normalizedDocuments.map((document) => ({
    path: document.path,
    byteLength: document.bytes.byteLength,
    sha256: sha256(document.bytes),
  }));
  const payload = {
    version: P17_APPEND_ONLY_RUN_STORE_VERSION,
    runId,
    status,
    createdAt,
    fileCount: files.length,
    files,
    chain,
  };
  return Object.freeze({
    ...payload,
    payloadHash: canonicalHash(payload),
    normalizedDocuments,
  });
}

/**
 * Canonical statement signed by the external custodian. The signature covers
 * the authority, anchor identity, trusted-key identity, issuance time and the
 * run payload hash; none of that metadata is left as an unsigned assertion.
 */
export function createExternalCustodySignaturePayload(anchor = {}) {
  const statement = {
    type: anchor.type,
    authority: anchor.authority,
    anchorId: anchor.anchorId,
    keyId: anchor.keyId,
    algorithm: anchor.algorithm,
    issuedAt: anchor.issuedAt,
    payloadHash: anchor.payloadHash,
  };
  if (statement.type !== P17_EXTERNAL_SIGNED_ANCHOR
    || !identifier(statement.authority, 128)
    || !identifier(statement.anchorId, 192)
    || !identifier(statement.keyId, 128)
    || statement.algorithm !== 'Ed25519'
    || !/^[a-f0-9]{64}$/u.test(String(statement.payloadHash || ''))) {
    throw storeError('P17_EXTERNAL_CUSTODY_ANCHOR_INVALID', 'External custody signature statement is invalid.');
  }
  assertUtcTimestamp(statement.issuedAt, 'P17_EXTERNAL_CUSTODY_ANCHOR_INVALID', 'anchor issuance timestamp');
  const canonical = canonicalJson(statement);
  return Object.freeze({
    statement: deepFreeze(statement),
    canonical,
    statementHash: sha256(Buffer.from(canonical, 'utf8')),
  });
}

export async function verifyAppendOnlyRun(runDirectory, options = {}) {
  const root = path.resolve(runDirectory);
  await assertSafeDirectory(root);
  const manifestPath = path.join(root, P17_RUN_INTEGRITY_FILE);
  const errors = [];
  let integrity;
  try {
    const manifestInfo = await lstat(manifestPath);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw storeError('P17_INTEGRITY_MANIFEST_UNSAFE', 'Integrity manifest must be a regular file.');
    integrity = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return Object.freeze({
      ok: false,
      errors: [error?.code?.startsWith?.('P17_') ? error.code : error?.name === 'SyntaxError' ? 'P17_INTEGRITY_JSON_INVALID' : 'P17_INTEGRITY_MANIFEST_MISSING'],
      integrity: null,
      assurance: buildAssurance('', null, false),
    });
  }
  if (!plainRecord(integrity)) return Object.freeze({
    ok: false,
    errors: ['P17_INTEGRITY_OBJECT_REQUIRED'],
    integrity,
    assurance: buildAssurance('', null, false),
  });
  if (!sameStringSet(Object.keys(integrity), INTEGRITY_KEYS)) errors.push('P17_INTEGRITY_SCHEMA_INVALID');
  if (integrity.version !== P17_APPEND_ONLY_RUN_STORE_VERSION) errors.push('P17_INTEGRITY_VERSION_INVALID');
  if (!P17_RUN_ID_PATTERN.test(String(integrity.runId || ''))) errors.push('P17_INTEGRITY_RUN_ID_INVALID');
  if (!Array.isArray(integrity.files) || integrity.files.length === 0) errors.push('P17_INTEGRITY_FILES_REQUIRED');
  if (!Array.isArray(integrity.chain)) errors.push('P17_INTEGRITY_CHAIN_INVALID');
  if (!Number.isInteger(integrity.fileCount) || integrity.fileCount !== (Array.isArray(integrity.files) ? integrity.files.length : 0)) errors.push('P17_INTEGRITY_FILE_COUNT_MISMATCH');
  if (typeof integrity.createdAt !== 'string' || !Number.isFinite(Date.parse(integrity.createdAt))) errors.push('P17_INTEGRITY_CREATED_AT_INVALID');
  if (typeof integrity.status !== 'string' || !/^[A-Z0-9_-]+$/u.test(integrity.status)) errors.push('P17_INTEGRITY_STATUS_INVALID');
  if (canonicalJson(integrity.storagePolicy) !== canonicalJson(P17_APPEND_ONLY_ASSURANCE_POLICY)) errors.push('P17_STORAGE_POLICY_INVALID');
  const core = Object.fromEntries(Object.entries(integrity).filter(([key]) => key !== 'integrityHash'));
  if (canonicalHash(core) !== integrity.integrityHash) errors.push('P17_INTEGRITY_HASH_MISMATCH');
  const seen = new Set();
  for (const row of Array.isArray(integrity.files) ? integrity.files : []) {
    if (!plainRecord(row) || typeof row.path !== 'string' || !Number.isInteger(row.byteLength) || row.byteLength < 0 || !/^[a-f0-9]{64}$/u.test(String(row.sha256 || ''))) {
      errors.push('P17_INTEGRITY_FILE_ROW_INVALID');
      continue;
    }
    if (seen.has(row.path)) errors.push('P17_INTEGRITY_DUPLICATE_PATH');
    seen.add(row.path);
    let file;
    try {
      file = resolveDescendant(root, row.path, 'P17_INTEGRITY_PATH_ESCAPE');
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) {
        errors.push('P17_INTEGRITY_NON_REGULAR_FILE');
        continue;
      }
      const bytes = await readFile(file);
      if (bytes.byteLength !== row.byteLength) errors.push('P17_INTEGRITY_SIZE_MISMATCH');
      if (sha256(bytes) !== row.sha256) errors.push('P17_INTEGRITY_FILE_HASH_MISMATCH');
    } catch (error) {
      errors.push(error?.code?.startsWith?.('P17_') ? error.code : 'P17_INTEGRITY_FILE_MISSING');
    }
  }
  const chainErrors = validateChainRows(integrity.chain);
  errors.push(...chainErrors);
  const custodyPayload = custodyPayloadFromIntegrity(integrity);
  const custody = verifyCustodyAnchor(
    integrity.custodyAnchor,
    custodyPayload,
    integrity.status,
    options.trustedExternalAnchorKeys,
  );
  errors.push(...custody.errors);
  const declaredFiles = new Set([...(Array.isArray(integrity.files) ? integrity.files : []).filter(plainRecord).map((row) => row.path).filter((value) => typeof value === 'string'), P17_RUN_INTEGRITY_FILE]);
  const declaredDirectories = new Set();
  for (const file of declaredFiles) {
    const segments = file.split('/');
    for (let index = 1; index < segments.length; index += 1) declaredDirectories.add(segments.slice(0, index).join('/'));
  }
  const inventory = await exactInventory(root);
  for (const row of inventory.files) if (!declaredFiles.has(row)) errors.push('P17_INTEGRITY_UNDECLARED_FILE');
  for (const row of declaredFiles) if (!inventory.files.includes(row)) errors.push('P17_INTEGRITY_DECLARED_FILE_MISSING');
  for (const row of inventory.directories) if (!declaredDirectories.has(row)) errors.push('P17_INTEGRITY_UNDECLARED_DIRECTORY');
  if (inventory.unsafeEntries.length) errors.push('P17_INTEGRITY_UNSAFE_ENTRY');
  const sealInspection = await inspectReadOnlySeal(root, inventory);
  if (sealInspection.enforcedByModeBits && !sealInspection.fullyReadOnly) errors.push('P17_READ_ONLY_SEAL_BROKEN');
  const integrityBytes = await readFile(manifestPath);
  const directoryRows = [...(Array.isArray(integrity.files) ? integrity.files : []), {
    path: P17_RUN_INTEGRITY_FILE,
    byteLength: integrityBytes.byteLength,
    sha256: sha256(integrityBytes),
  }].sort((left, right) => left.path.localeCompare(right.path));
  const uniqueErrors = [...new Set(errors)].sort();
  return Object.freeze({
    ok: uniqueErrors.length === 0,
    errors: uniqueErrors,
    integrity,
    custodyPayloadHash: custodyPayload.payloadHash,
    directoryHash: canonicalHash(directoryRows),
    sealInspection,
    assurance: buildAssurance(integrity.status, integrity.custodyAnchor, custody.externalSignatureVerified),
  });
}

export async function hashCommittedDirectory(runDirectory, options = {}) {
  const root = path.resolve(runDirectory);
  const verification = await verifyAppendOnlyRun(root, options);
  if (!verification.ok) throw storeError('P17_RUN_INTEGRITY_INVALID', verification.errors.join(', '));
  return verification.directoryHash;
}

function normalizeCustodyAnchor(anchor, specification, trustedExternalAnchorKeys) {
  const { status, payloadHash } = specification;
  if (!plainRecord(anchor)) {
    throw storeError(
      status === 'FRAMEWORK_FIXTURE' ? 'P17_LOCAL_FIXTURE_ANCHOR_REQUIRED' : 'P17_EXTERNAL_CUSTODY_ANCHOR_REQUIRED',
      status === 'FRAMEWORK_FIXTURE'
        ? 'FRAMEWORK_FIXTURE commits require an explicit LOCAL_FRAMEWORK_FIXTURE anchor.'
        : 'Every non-fixture commit requires an externally signed custody anchor.',
    );
  }
  if (status === 'FRAMEWORK_FIXTURE') {
    const keys = ['type', 'scope', 'payloadHash', 'terminalQualificationAllowed'];
    if (!sameStringSet(Object.keys(anchor), keys)
      || anchor.type !== P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR
      || anchor.scope !== P17_APPEND_ONLY_ASSURANCE_POLICY.fixtureScope
      || anchor.payloadHash !== payloadHash
      || anchor.terminalQualificationAllowed !== false) {
      throw storeError('P17_LOCAL_FIXTURE_ANCHOR_INVALID', 'FRAMEWORK_FIXTURE requires the exact result-free local fixture anchor contract.');
    }
    return {
      type: P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR,
      scope: P17_APPEND_ONLY_ASSURANCE_POLICY.fixtureScope,
      payloadHash,
      terminalQualificationAllowed: false,
    };
  }
  if (anchor.type !== P17_EXTERNAL_SIGNED_ANCHOR) {
    throw storeError('P17_EXTERNAL_CUSTODY_ANCHOR_REQUIRED', 'Non-fixture commits require EXTERNAL_SIGNED_ANCHOR custody.');
  }
  const keys = ['type', 'authority', 'anchorId', 'keyId', 'algorithm', 'issuedAt', 'payloadHash', 'signatureBase64'];
  if (!sameStringSet(Object.keys(anchor), keys)
    || anchor.payloadHash !== payloadHash
    || !validBase64(anchor.signatureBase64)) {
    throw storeError('P17_EXTERNAL_CUSTODY_ANCHOR_INVALID', 'External custody anchor schema or payload binding is invalid.');
  }
  const signaturePayload = createExternalCustodySignaturePayload(anchor);
  if (!plainRecord(trustedExternalAnchorKeys) || !Object.hasOwn(trustedExternalAnchorKeys, anchor.keyId)) {
    throw storeError('P17_EXTERNAL_ANCHOR_TRUST_REQUIRED', `No externally governed trusted key is configured for ${anchor.keyId}.`);
  }
  let signatureValid = false;
  try {
    const publicKey = createPublicKey(trustedExternalAnchorKeys[anchor.keyId]);
    signatureValid = verifySignature(
      null,
      Buffer.from(signaturePayload.canonical, 'utf8'),
      publicKey,
      Buffer.from(anchor.signatureBase64, 'base64'),
    );
  } catch (error) {
    throw storeError('P17_EXTERNAL_ANCHOR_SIGNATURE_INVALID', 'External custody signature could not be verified.', error);
  }
  if (!signatureValid) throw storeError('P17_EXTERNAL_ANCHOR_SIGNATURE_INVALID', 'External custody signature is invalid.');
  return {
    type: P17_EXTERNAL_SIGNED_ANCHOR,
    authority: anchor.authority,
    anchorId: anchor.anchorId,
    keyId: anchor.keyId,
    algorithm: 'Ed25519',
    issuedAt: anchor.issuedAt,
    payloadHash,
    signatureBase64: anchor.signatureBase64,
  };
}

function verifyCustodyAnchor(anchor, payload, status, trustedExternalAnchorKeys) {
  try {
    const normalized = normalizeCustodyAnchor(anchor, { ...payload, status }, trustedExternalAnchorKeys);
    return {
      errors: [],
      externalSignatureVerified: normalized.type === P17_EXTERNAL_SIGNED_ANCHOR,
    };
  } catch (error) {
    return {
      errors: [error?.code?.startsWith?.('P17_') ? error.code : 'P17_CUSTODY_ANCHOR_INVALID'],
      externalSignatureVerified: false,
    };
  }
}

function custodyPayloadFromIntegrity(integrity) {
  const payload = {
    version: integrity.version,
    runId: integrity.runId,
    status: integrity.status,
    createdAt: integrity.createdAt,
    fileCount: integrity.fileCount,
    files: integrity.files,
    chain: integrity.chain,
  };
  return { ...payload, payloadHash: canonicalHash(payload) };
}

function validateChainRows(chain) {
  if (!Array.isArray(chain)) return [];
  const errors = [];
  const names = new Set();
  for (const row of chain) {
    if (!plainRecord(row) || !sameStringSet(Object.keys(row), ['name', 'sha256'])) {
      errors.push('P17_INTEGRITY_CHAIN_ROW_SCHEMA_INVALID');
      continue;
    }
    if (typeof row.name !== 'string' || !P17_RUN_CHAIN_NAME_PATTERN.test(row.name)) {
      errors.push('P17_INTEGRITY_CHAIN_NAME_INVALID');
    }
    if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.sha256)) {
      errors.push('P17_INTEGRITY_CHAIN_SHA256_INVALID');
    }
    if (names.has(row.name)) errors.push('P17_INTEGRITY_CHAIN_DUPLICATE_NAME');
    names.add(row.name);
  }
  return errors;
}

function buildAssurance(status, anchor, externalSignatureVerified) {
  const fixtureAnchorValid = status === 'FRAMEWORK_FIXTURE'
    && anchor?.type === P17_LOCAL_FRAMEWORK_FIXTURE_ANCHOR;
  return deepFreeze({
    policyVersion: P17_APPEND_ONLY_ASSURANCE_POLICY.version,
    custodyAnchorType: anchor?.type || null,
    fixtureAnchorValid,
    externalSignatureVerified: Boolean(externalSignatureVerified),
    officialTerminalQualificationAnchorEligible: status !== 'FRAMEWORK_FIXTURE' && Boolean(externalSignatureVerified),
    localFilesystemWormGuaranteed: false,
    localRehashResistanceGuaranteed: false,
    readOnlySealIsDefenseInDepthOnly: true,
    officialTerminalQualificationRequires: P17_EXTERNAL_SIGNED_ANCHOR,
    limitations: P17_APPEND_ONLY_ASSURANCE_POLICY.limitations,
  });
}

async function writeDurableFile(destination, bytes, options = {}) {
  const handle = await open(destination, 'wx', options.mode ?? 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectoryBestEffort(directory) {
  let handle;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
    return true;
  } catch (error) {
    if (['EACCES', 'EINVAL', 'EISDIR', 'ENOTSUP', 'EPERM'].includes(error?.code)) return false;
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function syncDirectoryTreeBestEffort(root) {
  const inventory = await exactInventory(root);
  const directories = [...inventory.directories]
    .sort((left, right) => right.split('/').length - left.split('/').length)
    .map((relative) => path.join(root, ...relative.split('/')));
  const results = [];
  for (const directory of [...directories, root]) results.push(await syncDirectoryBestEffort(directory));
  return results.every(Boolean);
}

async function sealTreeReadOnly(root) {
  const inventory = await exactInventory(root);
  for (const relative of inventory.files) await chmod(path.join(root, ...relative.split('/')), 0o444);
  const directories = [...inventory.directories]
    .sort((left, right) => right.split('/').length - left.split('/').length);
  for (const relative of directories) await chmod(path.join(root, ...relative.split('/')), 0o555);
  await chmod(root, 0o555);
  const inspection = await inspectReadOnlySeal(root, inventory);
  return deepFreeze({
    policy: 'BEST_EFFORT_READ_ONLY_MODE_BITS_NOT_WORM',
    filesSealed: inventory.files.length,
    directoriesSealed: inventory.directories.length + 1,
    ...inspection,
  });
}

async function inspectReadOnlySeal(root, suppliedInventory) {
  const inventory = suppliedInventory || await exactInventory(root);
  const targets = [
    root,
    ...inventory.directories.map((relative) => path.join(root, ...relative.split('/'))),
    ...inventory.files.map((relative) => path.join(root, ...relative.split('/'))),
  ];
  const writableByMode = [];
  for (const target of targets) {
    const info = await lstat(target);
    if ((info.mode & 0o222) !== 0) writableByMode.push(path.relative(root, target).replaceAll('\\', '/') || '.');
  }
  return deepFreeze({
    enforcedByModeBits: process.platform !== 'win32',
    fullyReadOnly: writableByMode.length === 0,
    writableByMode,
  });
}

function normalizeDocuments(documents) {
  const rows = [];
  for (const [relativePath, value] of Object.entries(documents)) {
    const normalized = normalizeRelativePath(relativePath);
    if (normalized === P17_RUN_INTEGRITY_FILE) {
      throw storeError('P17_INTEGRITY_FILE_RESERVED', `${P17_RUN_INTEGRITY_FILE} is generated by the store.`);
    }
    assertFiniteJson(value, normalized);
    const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array
      ? Buffer.from(value)
      : Buffer.from(typeof value === 'string' ? value : `${canonicalPrettyJson(value)}\n`, 'utf8');
    rows.push({ path: normalized, bytes });
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) throw storeError('P17_RUN_DOCUMENT_DUPLICATE', 'Duplicate normalized document paths are forbidden.');
  return rows;
}

function normalizeChain(chain) {
  if (chain == null) return [];
  if (!Array.isArray(chain)) throw storeError('P17_RUN_CHAIN_INVALID', 'Run chain must be an array.');
  const rows = chain.map((row, index) => {
    if (!plainRecord(row)
      || !sameStringSet(Object.keys(row), ['name', 'sha256'])
      || typeof row.name !== 'string'
      || !P17_RUN_CHAIN_NAME_PATTERN.test(row.name)
      || typeof row.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(row.sha256)) {
      throw storeError('P17_RUN_CHAIN_INVALID', `Invalid chain row at index ${index}.`);
    }
    return { name: row.name, sha256: row.sha256 };
  });
  if (new Set(rows.map((row) => row.name)).size !== rows.length) throw storeError('P17_RUN_CHAIN_DUPLICATE', 'Run chain names must be unique.');
  return rows;
}

async function assertSafeDirectory(directory, allowedRoot) {
  const info = await lstat(directory).catch((error) => {
    if (error?.code === 'ENOENT') throw storeError('P17_RUNS_ROOT_MISSING', `Runs root does not exist: ${directory}`);
    throw error;
  });
  if (!info.isDirectory() || info.isSymbolicLink()) throw storeError('P17_RUNS_ROOT_UNSAFE', `Runs root must be a real directory: ${directory}`);
  const resolved = await realpath(directory);
  if (allowedRoot) {
    const allowed = await realpath(path.resolve(allowedRoot));
    if (resolved !== allowed && !resolved.startsWith(`${allowed}${path.sep}`)) {
      throw storeError('P17_RUNS_ROOT_OUTSIDE_ALLOWED_ROOT', `${resolved} is outside ${allowed}.`);
    }
  }
}

function resolveDirectChild(root, name, code) {
  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') throw storeError(code, `Invalid direct child name: ${name}`);
  const candidate = path.resolve(root, name);
  if (path.dirname(candidate) !== root) throw storeError(code, `${candidate} escapes ${root}.`);
  return candidate;
}

function resolveDescendant(root, relativePath, code) {
  const normalized = normalizeRelativePath(relativePath);
  const candidate = path.resolve(root, ...normalized.split('/'));
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`)) throw storeError(code, `${relativePath} escapes ${root}.`);
  return candidate;
}

function normalizeRelativePath(value) {
  const raw = String(value || '').replaceAll('\\', '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/u.test(raw)) throw storeError('P17_RUN_DOCUMENT_PATH_INVALID', `Invalid document path: ${raw || '(empty)'}`);
  const segments = raw.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw storeError('P17_RUN_DOCUMENT_PATH_INVALID', `Invalid document path: ${raw}`);
  }
  return segments.join('/');
}

function assertFiniteJson(value, label, seen = new Set()) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || typeof value === 'string' || value == null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw storeError('P17_NONFINITE_JSON_FORBIDDEN', `${label} contains NaN or Infinity.`);
    return;
  }
  if (typeof value !== 'object') throw storeError('P17_RUN_DOCUMENT_VALUE_INVALID', `${label} contains a non-JSON value.`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw storeError('P17_RUN_DOCUMENT_VALUE_INVALID', `${label} contains a non-plain JSON object.`);
  }
  if (seen.has(value)) throw storeError('P17_RUN_DOCUMENT_CYCLE', `${label} contains a cyclic value.`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((child, index) => assertFiniteJson(child, `${label}/${index}`, seen));
  else {
    for (const key of Object.keys(value)) {
      if (value[key] === undefined) throw storeError('P17_RUN_DOCUMENT_VALUE_INVALID', `${label}/${key} is undefined.`);
      assertFiniteJson(value[key], `${label}/${key}`, seen);
    }
  }
  seen.delete(value);
}

function canonicalHash(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalPrettyJson(value) {
  const sort = (node) => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === 'object') return Object.fromEntries(Object.keys(node).sort().map((key) => [key, sort(node[key])]));
    return node;
  };
  return JSON.stringify(sort(value), null, 2);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function pathExists(value) {
  try { await lstat(value); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

async function exactInventory(root) {
  const files = [];
  const directories = [];
  const unsafeEntries = [];
  const visit = async (directory, prefix = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      const info = await lstat(target);
      if (info.isSymbolicLink()) {
        unsafeEntries.push(relative);
      } else if (info.isDirectory()) {
        directories.push(relative.replaceAll('\\', '/'));
        await visit(target, relative);
      } else if (info.isFile()) {
        files.push(relative.replaceAll('\\', '/'));
      } else {
        unsafeEntries.push(relative);
      }
    }
  };
  await visit(root);
  return { files: files.sort(), directories: directories.sort(), unsafeEntries: unsafeEntries.sort() };
}

function storeError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function plainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertUtcTimestamp(value, code, label) {
  const normalized = typeof value === 'string' && value.includes('.') ? value : String(value || '').replace(/Z$/u, '.000Z');
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== normalized) {
    throw storeError(code, `Invalid UTC ${label}: ${value || '(empty)'}`);
  }
}

function identifier(value, maximumLength) {
  return typeof value === 'string'
    && value.length <= maximumLength
    && /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/u.test(value);
}

function validBase64(value) {
  if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) return false;
  return Buffer.from(value, 'base64').toString('base64') === value;
}

function sameStringSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
