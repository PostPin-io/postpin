import { createContext } from "svelte";
import type { HostBridge, NleBridge } from "../bridge";

export interface Bridges {
	nle: NleBridge;
	host: HostBridge;
}

// Set by App, read by every component below it
export const [getBridges, setBridges] = createContext<Bridges>();
