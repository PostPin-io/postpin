/* eslint-disable */

export interface IPCStore<T> {
	getState(): Promise<T>;
	getStateSync(): T;
	onStateChange(fn: (newState: T) => void): () => void;
}
export interface HostOption {
	id: string;
	name: string;
}
export interface IDesktopAPIImpl {
	listHosts(): Promise<HostOption[]> | HostOption[];
	getSelectedHost(): Promise<string> | string;
	selectHost(id: string): Promise<boolean> | boolean;
}
export interface IDesktopAPIRenderer {
	listHosts(): Promise<HostOption[]>;
	getSelectedHost(): Promise<string>;
	selectHost(id: string): Promise<boolean>;
}
export interface AvailableUpdate {
	version: string;
	apiVersion?: number;
}
export interface IUpdaterAPIImpl {
	checkForUpdate(): Promise<AvailableUpdate | null> | AvailableUpdate | null;
	downloadUpdate(): Promise<boolean> | boolean;
	installUpdate(): Promise<boolean> | boolean;
}
export interface IUpdaterAPIRenderer {
	checkForUpdate(): Promise<AvailableUpdate | null>;
	downloadUpdate(): Promise<boolean>;
	installUpdate(): Promise<boolean>;
	onUpdateProgress(fn: (fraction: number) => void): () => void;
}
