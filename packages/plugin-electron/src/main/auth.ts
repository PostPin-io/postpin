import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { shell } from "electron";
import { hostname } from "node:os";
import Store from "electron-store";

export interface AuthOptions {
	// device client id, must be listed in DEVICE_CLIENTS on the server
	clientId: string;
	// hosted server of this build, used when the user picks the hosted option
	defaultServerUrl: string;
}

// shown on the approval page and in the profile's session list so the user knows which machine this is
const deviceHeaders = () => ({ "x-device-name": hostname().replace(/\.local$/, "") });

export function createAuth({ clientId, defaultServerUrl }: AuthOptions) {
	const store = new Store<{ token?: string; serverUrl?: string }>({ name: "auth" });

	const getServerUrl = () => store.get("serverUrl") ?? defaultServerUrl;

	function setServerUrl(url: string) {
		const serverUrl = url.trim().replace(/\/+$/, "") || defaultServerUrl;
		// clear token on server change
		if (serverUrl !== getServerUrl()) store.delete("token");
		store.set("serverUrl", serverUrl);
	}

	const getAuthClient = () =>
		createAuthClient({
			baseURL: getServerUrl(),
			plugins: [deviceAuthorizationClient()],
			fetchOptions: {
				auth: { type: "Bearer", token: () => store.get("token") ?? "" },
			},
		});

	async function login(onCode: (code: string, url: string) => void) {
		const authClient = getAuthClient();
		const { data, error } = await authClient.device.code(
			{ client_id: clientId },
			{ headers: deviceHeaders() },
		);
		if (error) throw error;

		onCode(data.user_code, data.verification_uri); // show code in plugin UI
		await shell.openExternal(data.verification_uri_complete);

		let interval = (data.interval ?? 5) * 1000;
		const deadline = Date.now() + (data.expires_in ?? 1800) * 1000;

		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, interval));
			const res = await authClient.device.token(
				{
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: data.device_code,
					client_id: clientId,
				},
				{ headers: deviceHeaders() },
			);
			if (res.data?.access_token) {
				store.set("token", res.data.access_token);
				return;
			}
			switch (res.error?.error) {
				case "authorization_pending":
					continue;
				case "slow_down":
					interval += 5000;
					continue;
				case "access_denied":
					throw new Error("Denied in browser");
				default:
					throw new Error(res.error?.error_description ?? "Login failed");
			}
		}
		throw new Error("Code expired");
	}

	const getSession = async () => (await getAuthClient().getSession()).data;

	async function logout() {
		await getAuthClient().signOut();
		store.delete("token");
	}

	return {
		getDefaultServerUrl: () => defaultServerUrl,
		getServerUrl,
		setServerUrl,
		login,
		getSession,
		logout,
	};
}
