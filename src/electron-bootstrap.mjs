import { app } from 'electron';

// Acquire the process-wide lock before importing the application lifecycle.
// This prevents a second Windows launch from executing server/window startup code
// while the already-running Flight Deck EFB instance remains in the tray.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  try {
    await import('./electron-main.mjs');
  } catch (error) {
    console.error('[Flight Deck EFB] Electron bootstrap failed:', error);
    app.quit();
    process.exitCode = 1;
  }
}
