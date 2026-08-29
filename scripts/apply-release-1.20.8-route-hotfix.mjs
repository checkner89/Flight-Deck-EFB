import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function patch(relativePath, replacements) {
  const filename = path.join(root, relativePath);
  let source = await fs.readFile(filename, 'utf8');
  for (const [from, to] of replacements) {
    if (source.includes(from)) source = source.replace(from, to);
    else if (!source.includes(to)) throw new Error(`1.20.8 route hotfix anchor missing in ${relativePath}`);
  }
  await fs.writeFile(filename, source, 'utf8');
}

await patch('public/flight-overlay.js', [
  [
    'const hasSimBriefPlan = Boolean(state.integrations?.simbrief?.imported && plan.origin && plan.destination);',
    'const hasSimBriefPlan = Boolean(plan.origin && plan.destination);',
  ],
]);

await patch('public/release-1.20.8.js', [
  [
    'const hasPlan = Boolean(simbrief.imported && plan.origin && plan.destination);',
    'const hasPlan = Boolean(plan.origin && plan.destination);',
  ],
]);

console.log('Flight Deck EFB 1.20.8 SimBrief route priority hotfix materialized.');
