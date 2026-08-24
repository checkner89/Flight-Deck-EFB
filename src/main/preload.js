'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('flightDeck', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  getSimConnectStatus: () => ipcRenderer.invoke('simconnect:get-status'),
  retrySimConnect: () => ipcRenderer.invoke('simconnect:retry'),
  onSimConnectStatus: (callback) => subscribe('simconnect:status', callback),

  getUpdateStatus: () => ipcRenderer.invoke('update:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => subscribe('update:status', callback)
});
