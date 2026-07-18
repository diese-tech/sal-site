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
const fetchText = async (revision, path) => {
  const response = await fetch(`${rawBase}/${revision}/${path}`, {
    headers: { 'user-agent': 'diese-tech-db-contract-verifier' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Unable to fetch ${path} at ${revision}: HTTP ${response.status}`);
  }
  return response.text();
};

const [contractText, commitTypes, releaseContractText, releaseTypes] = await Promise.all([
  fetchText(lock.commit, 'contract.json'),
  fetchText(lock.commit, 'generated/database.types.ts'),
  fetchText(lock.release, 'contract.json'),
  fetchText(lock.release, 'generated/database.types.ts'),
]);
const contract = JSON.parse(contractText);
const releaseContract = JSON.parse(releaseContractText);
const typesHash = `sha256:${createHash('sha256').update(commitTypes).digest('hex')}`;

if (
  contract.version !== lock.release ||
  contract.migrationHead !== lock.migrationHead ||
  contract.typesSha256 !== lock.typesSha256
) {
  throw new Error('Pinned commit contract does not match db-contract.lock.json');
}
if (JSON.stringify(releaseContract) !== JSON.stringify(contract) || releaseTypes !== commitTypes) {
  throw new Error('Database release tag does not resolve to the pinned contract artifacts');
}
if (typesHash !== lock.typesSha256) {
  throw new Error(`Generated types hash mismatch: expected ${lock.typesSha256}, received ${typesHash}`);
}

if (mode === 'sync') {
  await writeFile(vendoredTypesPath, commitTypes, 'utf8');
}

const vendoredTypes = await readFile(vendoredTypesPath, 'utf8');
if (vendoredTypes !== commitTypes) {
  throw new Error(`Vendored types drifted from ${lock.release} at ${lock.commit}`);
}

console.log(
  `Verified ${lock.repository} ${lock.release} (${lock.migrationHead}) at ${lock.commit}`,
);
