/// <reference types="vite/client" />
import type { PetAPI } from '../main/preload';

declare global {
  interface Window {
    petAPI: PetAPI;
  }
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

export {};
