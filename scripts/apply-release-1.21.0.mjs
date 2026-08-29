const pkg = (await import('../package.json', { with: { type: 'json' } })).default;
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 release orchestrator requires package version 1.21.0, got ${pkg.version}.`);

await import('./apply-release-1.21.0-core.mjs');
await import('./apply-release-1.21.0-server.mjs');
await import('./apply-release-1.21.0-ui.mjs');

console.log('Flight Deck EFB 1.21.0 full backlog release materialized.');
