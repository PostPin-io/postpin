import { auth } from "#lib/server/auth.ts";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/env";
import { sequence, type Handle } from "@sveltejs/kit/hooks";
import { handleApiRequest } from "./api";
import { prisma } from "#lib/server/database.ts";

const authHandler: Handle = async ({ event, resolve }) => {
	return svelteKitHandler({ event, resolve, auth, building });
};

const apiHandler: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith("/api/")) {
		return handleApiRequest(event);
	}

	return resolve(event);
};
const sessionHandler: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.session = session?.session ?? null;
	event.locals.user = session?.user
		? await prisma.user.findUnique({
				where: { id: session.user.id },
				include: { memberships: { orderBy: { createdAt: "asc" } } },
			})
		: null;

	if (event.locals.session && event.locals.user) {
		await syncActiveOrganization(event.locals.session, event.locals.user);
	}

	const publicPaths = ["/", /\/auth\/.*/];

	const isPublicPath = publicPaths.some((path) => {
		if (typeof path === "string") {
			return event.url.pathname === path;
		} else {
			return path.test(event.url.pathname);
		}
	});

	if (!isPublicPath && !event.locals.user) {
		return new Response(null, {
			status: 301,
			headers: { Location: "/auth/login?redirect=" + encodeURIComponent(event.url.pathname) },
		});
	}

	const noOrgsPaths = ["/dashboard", "/profile"];
	if (
		event.locals.user &&
		event.locals.user.memberships.length === 0 &&
		!noOrgsPaths.some((path) => event.url.pathname.startsWith(path))
	) {
		if (noOrgsPaths.some((path) => event.url.pathname.startsWith(path))) {
			return new Response(null, {
				status: 301,
				headers: { Location: "/dashboard" },
			});
		}
	}

	return resolve(event);
};
/**
 * Makes sure a user with memberships always has an active organization: falls back to the
 * one they used last, then to their oldest membership. Also remembers the active one for next time.
 */
async function syncActiveOrganization(
	session: NonNullable<App.Locals["session"]>,
	user: NonNullable<App.Locals["user"]>,
) {
	const isMember = (id: string | null | undefined) =>
		!!id && user.memberships.some((m) => m.organizationId === id);

	let activeId = isMember(session.activeOrganizationId) ? session.activeOrganizationId! : null;

	if (!activeId && user.memberships.length > 0) {
		activeId = isMember(user.lastActiveOrganizationId)
			? user.lastActiveOrganizationId!
			: user.memberships[0].organizationId;
	}

	if (activeId !== (session.activeOrganizationId ?? null)) {
		await prisma.session.update({
			where: { id: session.id },
			data: { activeOrganizationId: activeId },
		});
		session.activeOrganizationId = activeId;
	}

	if (activeId && activeId !== user.lastActiveOrganizationId) {
		await prisma.user.update({
			where: { id: user.id },
			data: { lastActiveOrganizationId: activeId },
		});
		user.lastActiveOrganizationId = activeId;
	}
}

export const handle = sequence(authHandler, apiHandler, sessionHandler);
