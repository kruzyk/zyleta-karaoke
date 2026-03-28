/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONFIGCAT_SDK_KEY?: string;
  readonly VITE_FF_DECADES?: string;
  readonly VITE_FF_INTERNATIONAL?: string;
  readonly VITE_FF_WISHLIST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
