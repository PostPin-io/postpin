/* eslint-disable */

export * from "../common/PostPin.js";
import type { ICommonAPIRenderer } from "../../common/PostPin.js";
export const CommonAPI = (globalThis as any)["PostPin"]?.["CommonAPI"] as
	Partial<ICommonAPIRenderer> | undefined;
import type { INleAPIRenderer } from "../../common/PostPin.js";
export const NleAPI = (globalThis as any)["PostPin"]?.["NleAPI"] as
	Partial<INleAPIRenderer> | undefined;
