/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEDGER_TOKEN?: string;
  readonly VITE_BUILD_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
