/**
 * Fake for SvelteKit's request event. Server code reads the signed-in user and
 * session from `getRequestEvent().locals`; tests set them with `signIn()`.
 */
type Locals = {
	user?: { id: string; email: string; name: string } | null;
	session?: { id: string; userId: string; activeOrganizationId: string | null } | null;
};

let locals: Locals = {};

export const currentEvent = () => ({
	locals,
	request: new Request("http://localhost/"),
	url: new URL("http://localhost/"),
	cookies: { get: () => undefined, set: () => {}, delete: () => {} },
});

export function resetRequestEvent() {
	locals = {};
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
