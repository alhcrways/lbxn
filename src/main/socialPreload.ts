import { contextBridge, ipcRenderer } from 'electron';
import type { SocialAction, SocialState } from '../shared/social';

contextBridge.exposeInMainWorld('friendsAPI', {
  getState: () => ipcRenderer.invoke('friends:state') as Promise<SocialState>,
  action: (action: SocialAction) => ipcRenderer.invoke('friends:action', action),
  copyCode: () => ipcRenderer.invoke('friends:copy-code'),
  close: () => ipcRenderer.invoke('friends:close'),
  onState: (callback: (state: SocialState) => void) => {
    const listener = (_event: unknown, state: SocialState) => callback(state);
    ipcRenderer.on('friends:state-changed', listener);
    return () => ipcRenderer.off('friends:state-changed', listener);
  },
});
