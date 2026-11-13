/* eslint-disable */

export * from "../common/PostPinDesktop.js";
import type { IDesktopAPIRenderer } from "../../common/PostPinDesktop.js";
export const DesktopAPI = (globalThis as any)["PostPinDesktop"]?.["DesktopAPI"] as
	Partial<IDesktopAPIRenderer> | undefined;
import type { IUpdaterAPIRenderer } from "../../common/PostPinDesktop.js";
export const UpdaterAPI = (globalThis as any)["PostPinDesktop"]?.["UpdaterAPI"] as
	Partial<IUpdaterAPIRenderer> | undefined;
