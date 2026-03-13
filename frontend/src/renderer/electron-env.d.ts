/// <reference types="vite/client" />

// This file extends the Window interface with the electronAPI bridge
// exposed via contextBridge in preload.ts.
// The actual type is inferred from preload.ts — this file just satisfies
// the TypeScript compiler when accessing window.electronAPI in renderer code.
