// Load a machine file in Node. Machines import the engine as '/engine/src/...'
// (the path the browser sees); here that prefix is mapped to this skill.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export async function loadRapier() {
  const R = (await import(pathToFileURL(join(SKILL, 'node_modules/@dimforge/rapier3d-compat/rapier.mjs')).href)).default;
  const warn = console.warn; console.warn = () => {}; await R.init({}); console.warn = warn;
  return R;
}
export async function loadEngine(name) { return import(pathToFileURL(join(SKILL, 'engine/src', name)).href); }
export async function loadMachine(file) {
  const src = readFileSync(resolve(file), 'utf8').replaceAll(/(['"])\/engine\//g, `$1${pathToFileURL(join(SKILL, 'engine')).href}/`);
  const dir = mkdtempSync(join(tmpdir(), 'machine-'));
  const tmp = join(dir, 'machine.mjs'); writeFileSync(tmp, src);
  try { return (await import(pathToFileURL(tmp).href)).default; } finally { rmSync(dir, { recursive: true, force: true }); }
}
