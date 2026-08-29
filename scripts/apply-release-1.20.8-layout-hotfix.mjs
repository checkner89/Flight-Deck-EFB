import fs from 'node:fs/promises';

const cssFile = 'public/release-1.20.8.css';
const marker = '/* Flight Deck EFB 1.20.8 — home/footer overlap hotfix */';
let css = await fs.readFile(cssFile, 'utf8');

if (!css.includes(marker)) {
  css = `${css.trimEnd()}\n\n${marker}\n.app-shell.home-mode{grid-template-rows:66px 0 minmax(0,1fr) 34px!important}\n.app-shell.home-mode .efb-pages{grid-row:2 / 4!important;min-height:0!important;overflow:auto!important;padding-bottom:max(26px,env(safe-area-inset-bottom))!important}\n.app-shell.home-mode .home-launcher{box-sizing:border-box!important;min-height:0!important;padding-bottom:4px!important}\n.global-footer{grid-row:4!important;min-height:34px!important;overflow:hidden!important;isolation:isolate!important;z-index:1600!important}\n@media(max-width:900px){.app-shell.home-mode{grid-template-rows:calc(58px + env(safe-area-inset-top)) 0 minmax(0,1fr) 34px!important}.app-shell.home-mode .efb-pages{padding-bottom:max(22px,env(safe-area-inset-bottom))!important}}\n`;
  await fs.writeFile(cssFile, css, 'utf8');
}

console.log('Flight Deck EFB 1.20.8 home/footer overlap hotfix materialized.');
