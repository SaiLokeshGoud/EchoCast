const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop integration APIs to the React renderer
contextBridge.exposeInMainWorld('echoCastDesktop', {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onMediaKey: (callback) => {
    ipcRenderer.on('media-key', (event, key) => callback(key));
  },
});
