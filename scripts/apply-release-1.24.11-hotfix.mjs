import fs from 'node:fs/promises';

const filename = 'src/electron-main.mjs';
let source = await fs.readFile(filename, 'utf8');

source = source.replace(
  /\napp\.setAppUserModelId\('de\.checkner\.flightdeckefb'\);\nconst hasSingleInstanceLock = app\.requestSingleInstanceLock\(\);\nif \(!hasSingleInstanceLock\) app\.quit\(\);\n/,
  "\napp.setAppUserModelId('de.checkner.flightdeckefb');\n",
);

source = source.replace("    show: false,\n    backgroundColor: '#07121c',", "    show: true,\n    backgroundColor: '#07121c',");

if (!source.includes('startupDocument({ failed: true')) {
  const pattern = /app\.whenReady\(\)\.then\(createWindow\)\.catch\(\(error\) => \{[\s\S]*?\n\}\);/;
  if (!pattern.test(source)) throw new Error('1.24.11 app.whenReady startup wrapper anchor is missing.');
  source = source.replace(pattern, `app.whenReady().then(async () => {\n  createStartupWindow();\n  try {\n    await createWindow();\n  } catch (error) {\n    console.error('[FLYXORA] Desktop startup failed:', error);\n    const target = startupWindow && !startupWindow.isDestroyed() ? startupWindow : createStartupWindow();\n    await target.loadURL(\`data:text/html;charset=utf-8,\${encodeURIComponent(startupDocument({ failed: true, detail: error?.stack || error?.message || String(error) }))}\`).catch(() => {});\n    target.show();\n    target.focus();\n  }\n}).catch((error) => {\n  console.error('[FLYXORA] Electron readiness failed:', error);\n  dialog.showErrorBox('FLYXORA', \`Die Anwendung konnte nicht gestartet werden.\\n\\n\${error.message}\`);\n  app.quit();\n});`);
}

if (!source.includes('function createStartupWindow()')) throw new Error('1.24.11 startup window helper was not materialized.');
if (!source.includes('startupDocument({ failed: true')) throw new Error('1.24.11 visible startup failure wrapper was not materialized.');
if (source.includes('const hasSingleInstanceLock = app.requestSingleInstanceLock();')) throw new Error('1.24.11 duplicate single-instance lock remains.');

await fs.writeFile(filename, source, 'utf8');
console.log('FLYXORA 1.24.11 startup wrapper hotfix applied.');
