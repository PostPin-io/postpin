// Minimal RPC over postMessage between the UXP panel (runs the bridges) and the webview (runs the UI).
// Function arguments (onProgress, onCode, session listeners) are sent as callback ids and
// called back with a "callback" message.

// calls whose callbacks outlive the call, e.g. listeners
const PERSISTENT_CALLBACKS = new Set(["onSessionChanged"]);
export type RpcMessage =
	| { pp: "call"; id: number; target: string; method: string; args: unknown[] }
	| { pp: "result"; id: number; ok: true; value: unknown }
	| { pp: "result"; id: number; ok: false; error: string }
	| { pp: "callback"; callback: number; args: unknown[] };

interface CallbackRef {
	__ppCallback: number;
}

function isCallbackRef(value: unknown): value is CallbackRef {
	return typeof value === "object" && value !== null && "__ppCallback" in value;
}

/** UXP passes objects through, but be lenient in case a side receives the JSON string */
export function parseMessage(data: unknown): RpcMessage | null {
	const value = typeof data === "string" ? safeParse(data) : data;
	return typeof value === "object" && value !== null && "pp" in value
		? (value as RpcMessage)
		: null;
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Webview side: proxies whose methods forward to the panel */
export function createRpcClient(send: (msg: RpcMessage) => void) {
	let nextId = 1;
	const pending = new Map<
		number,
		{ resolve: (v: unknown) => void; reject: (e: Error) => void; callbacks: number[] }
	>();
	const callbacks = new Map<number, (...args: unknown[]) => void>();

	function handle(msg: RpcMessage) {
		if (msg.pp === "result") {
			const call = pending.get(msg.id);
			if (!call) return;
			pending.delete(msg.id);
			if (msg.ok) call.resolve(msg.value);
			else call.reject(new Error(msg.error));
			// release the call's callbacks, except listeners (PERSISTENT_CALLBACKS)
			for (const callback of call.callbacks) {
				callbacks.delete(callback);
			}
		} else if (msg.pp === "callback") {
			callbacks.get(msg.callback)?.(...msg.args);
		}
	}

	/**
	 * A proxy answers every name with a function, so optional members (`host.updater?`) would look
	 * present. List those the panel doesn't implement in `absent`: they read as undefined.
	 */
	function proxy<T extends object>(
		target: string,
		{ absent = [] }: { absent?: (keyof T)[] } = {},
	): T {
		const missing = new Set<PropertyKey>(absent);
		return new Proxy({} as T, {
			get: (_, method) => {
				if (typeof method !== "string" || method === "then" || missing.has(method))
					return undefined;
				return (...args: unknown[]) => {
					const id = nextId++;
					const ownCallbacks: number[] = [];
					const encoded = args.map((arg) => {
						if (typeof arg !== "function") return arg;
						const callback = nextId++;
						callbacks.set(callback, arg as (...a: unknown[]) => void);
						ownCallbacks.push(callback);
						return { __ppCallback: callback } satisfies CallbackRef;
					});
					return new Promise((resolve, reject) => {
						pending.set(id, {
							resolve,
							reject,
							callbacks: PERSISTENT_CALLBACKS.has(method) ? [] : ownCallbacks,
						});
						send({ pp: "call", id, target, method, args: encoded });
					});
				};
			},
		});
	}

	return { handle, proxy };
}

/** Panel side: runs calls from the webview against the real objects */
export function createRpcServer(targets: Record<string, object>, send: (msg: RpcMessage) => void) {
	return async function handle(msg: RpcMessage) {
		if (msg.pp !== "call") return;
		const { id, target, method } = msg;
		try {
			const object = targets[target] as Record<string, unknown> | undefined;
			const fn = object?.[method];
			if (typeof fn !== "function") throw new Error(`Unknown method ${target}.${method}`);
			const args = msg.args.map((arg) =>
				isCallbackRef(arg)
					? (...cbArgs: unknown[]) =>
							send({ pp: "callback", callback: arg.__ppCallback, args: cbArgs })
					: arg,
			);
			const value = await fn.apply(object, args);
			// functions (e.g. unsubscribe) can't cross postMessage
			send({ pp: "result", id, ok: true, value: typeof value === "function" ? null : value });
		} catch (e) {
			send({ pp: "result", id, ok: false, error: e instanceof Error ? e.message : String(e) });
		}
	};
}
