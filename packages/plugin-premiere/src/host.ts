import type { premierepro } from "@adobe/premierepro";

declare const require: (id: string) => any;

// UXP provides these modules at runtime, vite.config.ts keeps them external
export const ppro = require("premierepro") as premierepro;
export const uxp = require("uxp");
export const fs = require("fs");
export const os = require("os");

export const isMac = os.platform() === "darwin";
export const sep = isMac ? "/" : "\\";
