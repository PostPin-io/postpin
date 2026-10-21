import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { shell } from "electron";
import { hostname } from "node:os";
import Store from "electron-store";

const CLIENT_ID = "io.postpin.plugin-resolve";
const POSTPIN_URL = "http://localhost:5173";

const store = new Store<{ token?: string }>({ name: "auth" });

export const authClient = createAuthClient({
	baseURL: POSTPIN_URL,
	plugins: [deviceAuthorizationClient()],
	fetchOptions: {
		auth: { type: "Bearer", token: () => store.get("token") ?? "" },
	},
});

// shown on the approval page and in the profile's session list so the user knows which machine this is
const deviceHeaders = () => ({ "x-device-name": hostname().replace(/\.local$/, "") });

export async function login(onCode: (code: string, url: string) => void) {
	const { data, error } = await authClient.device.code(
		{ client_id: CLIENT_ID },
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
				client_id: CLIENT_ID,
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

export const getSession = async () => (await authClient.getSession()).data;
export async function logout() {
	await authClient.signOut();
	store.delete("token");
}
