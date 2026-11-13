import { describe, expect, it } from "vitest";
import { createRpcClient, createRpcServer, type RpcMessage } from "../src/rpc.ts";

/** Client and server wired directly, like the webview and the panel */
function connect(targets: Record<string, object>) {
	let client: ReturnType<typeof createRpcClient>;
	const server = createRpcServer(targets, (msg) => client.handle(msg));
	client = createRpcClient((msg: RpcMessage) => void server(msg));
	return client;
}

describe("rpc proxy", () => {
	interface Host {
		getToken(): Promise<string>;
		updater?: { check(): Promise<null> };
		transcode?(input: string): Promise<string>;
	}

	it("forwards calls and their results", async () => {
		const host = connect({ host: { getToken: async () => "t1" } }).proxy<Host>("host");
		await expect(host.getToken()).resolves.toBe("t1");
	});

	it("reads members listed as absent as undefined, so optional features look missing", () => {
		const host = connect({ host: {} }).proxy<Host>("host", { absent: ["updater", "transcode"] });
		expect(host.updater).toBeUndefined();
		expect(host.transcode).toBeUndefined();
		expect(typeof host.getToken).toBe("function");
	});

	it("calls back progress callbacks", async () => {
		const seen: number[] = [];
		const host = connect({
			host: {
				transcode: async (_input: string, onProgress: (f: number) => void) => {
					onProgress(0.5);
					return "done";
				},
			},
		}).proxy<{ transcode(input: string, onProgress: (f: number) => void): Promise<string> }>(
			"host",
		);
		await expect(host.transcode("in.mp4", (f) => seen.push(f))).resolves.toBe("done");
		expect(seen).toEqual([0.5]);
	});
});
