// Browser polyfills for Node.js built-in modules
// This file is imported first to ensure polyfills are available globally

import { Buffer } from "buffer";
import process from "process/browser";

// Make Buffer and process available globally
if (typeof window !== "undefined") {
  window.Buffer = Buffer;
  window.process = process;
  window.global = window;
}

export { Buffer, process };
