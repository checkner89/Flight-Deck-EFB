import fs from 'node:fs/promises';

const filename = 'src/online-network-client.mjs';
let source = await fs.readFile(filename, 'utf8');

if (source.includes('this.#scheduleRefresh();') && !source.includes('  #scheduleRefresh() {')) {
  const anchor = '  disable() {';
  if (!source.includes(anchor)) throw new Error('1.24.8 network hotfix: disable() anchor missing.');
  const method = `  #scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    if (!ENDPOINTS[this.selected]) return;
    this.refreshTimer = setTimeout(() => {
      const selected = this.selected;
      this.refresh(selected).catch((error) => {
        this.engine.setIntegration('onlineNetworks', {
          selected,
          status: 'error',
          detail: \`${'${selected.toUpperCase()}'} refresh failed: ${'${error.message}'}\`,
        });
        this.#scheduleRefresh();
      });
    }, this.pollMs);
    this.refreshTimer.unref?.();
  }

  stop() {
    this.selected = 'off';
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

`;
  source = source.replace(anchor, `${method}${anchor}`);
}

if (!source.includes('  #scheduleRefresh() {')) throw new Error('1.24.8 network hotfix: refresh scheduler declaration missing.');
if (!source.includes('  stop() {')) throw new Error('1.24.8 network hotfix: stop() declaration missing.');

await fs.writeFile(filename, source, 'utf8');
console.log('FLYXORA 1.24.8 candidate network refresh hotfix applied.');
