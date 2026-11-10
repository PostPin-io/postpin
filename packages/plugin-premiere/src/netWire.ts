// API requests from the webview run in the panel: macOS App Transport Security blocks http in
// Premiere's webview (localhost and self-hosted servers), and https would need CORS for the
// plugin: origin. The panel's fetch has neither restriction. Bodies are text, the API is JSON.

export interface WireRequest {
	url: string;
	method: string;
	headers: [string, string][];
	body?: string;
}

export interface WireResponse {
	status: number;
	statusText: string;
	headers: [string, string][];
	body: string;
}

export interface NetBridge {
	fetch(request: WireRequest): Promise<WireResponse>;
}
