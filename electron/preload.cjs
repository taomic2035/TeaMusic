const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('teaMusicBackend', {
  scanResolvedLibrary: () => ipcRenderer.invoke('musicol:scan-resolved'),
  scanLocalLibrary: () => ipcRenderer.invoke('musicol:scan-local'),
  chooseLocalAudioFiles: () => ipcRenderer.invoke('musicol:choose-local'),
  removeLocalAudioFile: (filePath) => ipcRenderer.invoke('musicol:remove-local', filePath),
  revealLocalAudioFile: (filePath) => ipcRenderer.invoke('musicol:reveal-local', filePath),
  readLocalLyrics: (filePath) => ipcRenderer.invoke('musicol:read-lyrics', filePath),
  readLocalArtwork: (filePath) => ipcRenderer.invoke('musicol:read-artwork', filePath),
  searchOnline: (query) => ipcRenderer.invoke('fangpi:search', query),
  downloadOnline: (musicId) => ipcRenderer.invoke('fangpi:download', musicId),
  openVerificationPage: (url) => ipcRenderer.invoke('fangpi:verify', url),
});
