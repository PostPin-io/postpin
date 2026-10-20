/* eslint-disable */

export * from "../common/PostPinResolveAPI.js";
import type { IMainAPIRenderer } from "../../common/PostPinResolveAPI.js";
export const MainAPI = (globalThis as any)["PostPinResolveAPI"]?.["MainAPI"] as
	Partial<IMainAPIRenderer> | undefined;
