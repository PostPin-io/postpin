import * as env from "$app/env/private";
import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";

export function isSystemAdmin(user: App.Locals["user"]) {
	return !!user && user.emailVerified && env.ADMIN_EMAILS.includes(user.email.toLowerCase());
}

export function requireSystemAdmin() {
	const { user } = getRequestEvent().locals;
	if (!isSystemAdmin(user)) error(404, "Not found"); // 404: don't reveal the page exists
	return user!;
}
