'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flightDeck', {
  retrySimConnect: () => ipcRenderer.invoke('simconnect:retry'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onSimConnectStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('simconnect:status', listener);
    return () => ipcRenderer.removeListener('simconnect:status', listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  onVersion: (callback) => {
    const listener = (_event, version) => callback(version);
    ipcRenderer.on('app:version', listener);
    return () => ipcRenderer.removeListener('app:version', listener);
  }
});
