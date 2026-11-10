import type { LoginCode } from "@postpin-io/plugin-core/bridge";
import { os, uxp } from "../host";
import { createStore, deleteSecret, getSecret, setSecret } from "./store";

declare const DEFAULT_SERVER_URL: string;

// must be listed in DEVICE_CLIENTS on the server
const CLIENT_ID = "io.postpin.plugin.premiere";
const TOKEN_KEY = "postpin-token";

// serverUrl is only stored for a self-hosted server, see plugin-electron's auth.ts
const store = createStore<{ serverUrl?: string }>("auth.json", {});

export const getDefaultServerUrl = () => DEFAULT_SERVER_URL;
export async function getServerUrl() {
	return (await store.read()).serverUrl ?? DEFAULT_SERVER_URL;
}

async function setServerUrl(url: string) {
	const serverUrl = url.trim().replace(/\/+$/, "") || DEFAULT_SERVER_URL;
	// clear token on server change
	if (serverUrl !== (await getServerUrl())) await deleteSecret(TOKEN_KEY);
	await store.update({ serverUrl: serverUrl === DEFAULT_SERVER_URL ? undefined : serverUrl });
}

// shown on the approval page and in the profile's session list
function deviceName() {
	try {
		return String(os.hostname()).replace(/\.local$/, "") || "Premiere Pro";
	} catch {
		return "Premiere Pro";
	}
}

async function authFetch(path: string, body?: unknown) {
	const token = await getSecret(TOKEN_KEY);
	return fetch(`${await getServerUrl()}/api/auth${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: {
			"Content-Type": "application/json",
			"x-device-name": deviceName(),
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

export async function login(serverUrl: string, onCode: (code: LoginCode) => void) {
	await setServerUrl(serverUrl);
	const res = await authFetch("/device/code", { client_id: CLIENT_ID });
	if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
	const data = await res.json();

	onCode({ userCode: data.user_code, verificationUri: data.verification_uri });
	await uxp.shell.openExternal(data.verification_uri_complete);

	let interval = (data.interval ?? 5) * 1000;
	const deadline = Date.now() + (data.expires_in ?? 1800) * 1000;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, interval));
		const tokenRes = await authFetch("/device/token", {
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: data.device_code,
			client_id: CLIENT_ID,
		});
		const body = await tokenRes.json().catch(() => ({}));
		if (body.access_token) {
			await setSecret(TOKEN_KEY, body.access_token);
			return;
		}
		switch (body.error) {
			case "authorization_pending":
				continue;
			case "slow_down":
				interval += 5000;
				continue;
			case "access_denied":
				throw new Error("Denied in browser");
			default:
				throw new Error(body.error_description ?? "Login failed");
		}
	}
	throw new Error("Code expired");
}

export async function getSession() {
	if (!(await getSecret(TOKEN_KEY))) return null;
	const res = await authFetch("/get-session");
	return res.ok ? await res.json() : null;
}

export async function logout() {
	await authFetch("/sign-out", {}).catch(() => {});
	await deleteSecret(TOKEN_KEY);
}

export const getToken = () => getSecret(TOKEN_KEY);
