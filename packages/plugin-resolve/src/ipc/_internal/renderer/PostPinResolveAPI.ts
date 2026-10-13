/* eslint-disable */

export * from "../common/PostPinResolveAPI.js";
import type { ISettingsRenderer } from "../../common/PostPinResolveAPI.js";
export const Settings = (globalThis as any)["PostPinResolveAPI"]?.["Settings"] as
	Partial<ISettingsRenderer> | undefined;
