import type { Cookies } from "@sveltejs/kit";

/**
 * Fake for SvelteKit's request event. Server code reads the signed-in user and
 * session from `getRequestEvent().locals`; tests set them with `signIn()`.
 */
type Locals = {
	user?: { id: string; email: string; name: string } | null;
	session?: { id: string; userId: string; activeOrganizationId: string | null } | null;
};

let locals: Locals = {};

const noCookies = { get: () => undefined, set: () => {}, delete: () => {} } as unknown as Cookies;
let cookies: Cookies = noCookies;

export const currentEvent = () => ({
	locals,
	request: new Request("http://localhost/"),
	url: new URL("http://localhost/"),
	cookies,
});

export function resetRequestEvent() {
	locals = {};
	cookies = noCookies;
}

/** Act as the browser holding these cookies (share-link guests) */
export function useCookies(jar: Cookies) {
	cookies = jar;
}

/** Act as `user` with `organizationId` as the active org (better-auth session). */
export function signIn(
	user: { id: string; email: string; name: string },
	organizationId: string | null = null,
) {
	locals = {
		user,
		session: { id: `session-${user.id}`, userId: user.id, activeOrganizationId: organizationId },
	};
}

export function signOut() {
	locals = {};
}
