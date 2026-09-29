import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [mode = 'check', typesPath] = process.argv.slice(2);

if (!['check', 'sync'].includes(mode) || !typesPath) {
  throw new Error('Usage: node scripts/db-contract.mjs <check|sync> <vendored-types-path>');
}

const root = resolve(import.meta.dirname, '..');
const lockPath = resolve(root, 'db-contract.lock.json');
const vendoredTypesPath = resolve(root, typesPath);
const lock = JSON.parse(await readFile(lockPath, 'utf8'));

if (lock.repository !== 'diese-tech/sal-database') {
  throw new Error('db-contract.lock.json must reference diese-tech/sal-database');
}
if (!/^db-v\d+\.\d+\.\d+$/.test(lock.release)) {
  throw new Error('Database release must use the db-vX.Y.Z format');
}
if (!/^[0-9a-f]{40}$/.test(lock.commit)) {
  throw new Error('Database commit must be a full 40-character SHA');
}
if (!/^\d{14}$/.test(lock.migrationHead)) {
  throw new Error('Database migrationHead must be a 14-digit Supabase version');
}
if (!/^sha256:[0-9a-f]{64}$/.test(lock.typesSha256)) {
  throw new Error('Database typesSha256 must be a prefixed SHA-256 digest');
}

const rawBase = 'https://raw.githubusercontent.com/diese-tech/sal-database';
const fetchAttempts = 3;
const fetchTimeoutMs = 30_000;

const isRetryableStatus = (status) => status === 408 || status === 429 || status >= 500;
const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

const fetchText = async (revision, path) => {
  const url = `${rawBase}/${revision}/${path}`;
  let lastError;

  for (let attempt = 1; attempt <= fetchAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': 'diese-tech-db-contract-verifier' },
        signal: AbortSignal.timeout(fetchTimeoutMs),
      });
      if (response.ok) return response.text();

      const error = new Error(`Unable to fetch ${path} at ${revision}: HTTP ${response.status}`);
      error.status = response.status;
      if (!isRetryableStatus(response.status)) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'TimeoutError' || error?.name === 'TypeError';
      if (!retryable) throw error;
    }

    if (attempt < fetchAttempts) await wait(1_000 * attempt);
  }

  throw new Error(
    `Unable to fetch ${path} at ${revision} after ${fetchAttempts} attempts`,
    { cause: lastError },
  );
};

// The pinned commit is the source of truth and must always resolve. The release
// tag is a convenience label that sal-database publishes only after a production
// deploy, so it may legitimately lag the commit; treat a missing tag (404) as a
// warning, but still fail if it exists and points at different artifacts, or if
// any other error (network, 5xx) stops us from checking it.
const fetchIfPublished = async (revision, path) => {
  try {
    return await fetchText(revision, path);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
};

const [contractText, commitTypes, releaseContractText, releaseTypes] = await Promise.all([
  fetchText(lock.commit, 'contract.json'),
  fetchText(lock.commit, 'generated/database.types.ts'),
  fetchIfPublished(lock.release, 'contract.json'),
  fetchIfPublished(lock.release, 'generated/database.types.ts'),
]);
const contract = JSON.parse(contractText);
const typesHash = `sha256:${createHash('sha256').update(commitTypes).digest('hex')}`;

if (
  contract.version !== lock.release ||
  contract.migrationHead !== lock.migrationHead ||
  contract.typesSha256 !== lock.typesSha256
) {
  throw new Error('Pinned commit contract does not match db-contract.lock.json');
}
if (releaseContractText === null && releaseTypes === null) {
  console.warn(
    `::warning::Release tag ${lock.release} is not published in ${lock.repository}; ` +
      `verified against pinned commit ${lock.commit} only.`,
  );
} else if (releaseContractText === null || releaseTypes === null) {
  // One artifact resolves and the other 404s: a malformed or half-published tag,
  // not an absent one, so it must not be waved through.
  throw new Error(`Database release tag ${lock.release} is only partially published`);
} else if (
  JSON.stringify(JSON.parse(releaseContractText)) !== JSON.stringify(contract) ||
  releaseTypes !== commitTypes
) {
  throw new Error('Database release tag does not resolve to the pinned contract artifacts');
}
if (typesHash !== lock.typesSha256) {
  throw new Error(`Generated types hash mismatch: expected ${lock.typesSha256}, received ${typesHash}`);
}

if (mode === 'sync') {
  await writeFile(vendoredTypesPath, commitTypes, 'utf8');
}

const vendoredTypes = await readFile(vendoredTypesPath, 'utf8');
const normalizeLineEndings = (text) => text.replaceAll('\r\n', '\n');
if (normalizeLineEndings(vendoredTypes) !== normalizeLineEndings(commitTypes)) {
  throw new Error(`Vendored types drifted from ${lock.release} at ${lock.commit}`);
}

console.log(
  `Verified ${lock.repository} ${lock.release} (${lock.migrationHead}) at ${lock.commit}`,
);
