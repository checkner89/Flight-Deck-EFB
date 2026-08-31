import fs from 'node:fs/promises';

const networkFilename = 'src/online-network-client.mjs';
let networkSource = await fs.readFile(networkFilename, 'utf8');

if (networkSource.includes('this.#scheduleRefresh();') && !networkSource.includes('  #scheduleRefresh() {')) {
  const anchor = '  disable() {';
  if (!networkSource.includes(anchor)) throw new Error('1.24.8 network hotfix: disable() anchor missing.');
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
  networkSource = networkSource.replace(anchor, `${method}${anchor}`);
}

if (!networkSource.includes('  #scheduleRefresh() {')) throw new Error('1.24.8 network hotfix: refresh scheduler declaration missing.');
if (!networkSource.includes('  stop() {')) throw new Error('1.24.8 network hotfix: stop() declaration missing.');

await fs.writeFile(networkFilename, networkSource, 'utf8');

const stateFilename = 'src/state-engine.mjs';
let stateSource = await fs.readFile(stateFilename, 'utf8');

if (!stateSource.includes('adoptUnboundExactTaxiPath')) {
  const oldBlock = `    if (changed && normalizedProvider === 'sayintentions' && this.state.taxi.pathSource === 'sayintentions') {
      const exactMeta = this.state.taxi.pathMetadata || {};
      const exactPathMatchesClearance = (clearance.id !== null && exactMeta.clearanceId !== null && exactMeta.clearanceId !== undefined
        && String(clearance.id) === String(exactMeta.clearanceId))
        || (exactMeta.clearanceText && exactMeta.clearanceText === clearance.text);
      if (!exactPathMatchesClearance) this.#setTaxiPath([], null, null);
    }`;
  const newBlock = `    if (changed && normalizedProvider === 'sayintentions' && this.state.taxi.pathSource === 'sayintentions') {
      const exactMeta = this.state.taxi.pathMetadata || {};
      const hasExactTaxiPath = Array.isArray(this.state.taxi.path) && this.state.taxi.path.length > 1;
      const exactPathUnbound = hasExactTaxiPath
        && (exactMeta.clearanceId === null || exactMeta.clearanceId === undefined)
        && !exactMeta.clearanceText;
      const exactPathMatchesClearance = (clearance.id !== null && exactMeta.clearanceId !== null && exactMeta.clearanceId !== undefined
        && String(clearance.id) === String(exactMeta.clearanceId))
        || (exactMeta.clearanceText && exactMeta.clearanceText === clearance.text);
      const adoptUnboundExactTaxiPath = exactPathUnbound && hasExactTaxiPath;
      if (adoptUnboundExactTaxiPath) {
        this.state.taxi.pathMetadata = {
          ...exactMeta,
          exact: true,
          clearanceId: clearance.id ?? null,
          clearanceText: clearance.text,
        };
      } else if (!exactPathMatchesClearance) {
        this.#setTaxiPath([], null, null);
      }
    }`;
  if (!stateSource.includes(oldBlock)) throw new Error('1.24.8 state hotfix: exact SI path freshness block missing.');
  stateSource = stateSource.replace(oldBlock, newBlock);
}

await fs.writeFile(stateFilename, stateSource, 'utf8');
console.log('FLYXORA 1.24.8 candidate network refresh + exact SI taxi-path hotfix applied.');
