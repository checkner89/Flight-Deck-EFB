import { app, dialog } from 'electron';

// Acquire the process-wide lock before importing the application lifecycle.
// This prevents a second Windows launch from executing server/window startup code
// while the already-running FLYXORA instance remains in the tray.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  try {
    await import('./electron-main.mjs');
  } catch (error) {
    console.error('[FLYXORA] Electron bootstrap failed:', error);
    const detail = error?.stack || error?.message || String(error);
    try {
      dialog.showErrorBox('FLYXORA Startfehler', `FLYXORA konnte die Desktop-Oberfläche nicht initialisieren.\n\n${detail}`);
    } catch {}
    app.quit();
    process.exitCode = 1;
  }
}
