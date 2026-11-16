import { refreshAll } from "$app/navigation";
import { authClient } from "#lib/auth-client.ts";
import { availableOrganizationSlug } from "#lib/slug.ts";

/** Creates an organization and makes it the active one. Throws with a message for the user. */
export async function createOrganization(name: string) {
	const { error } = await authClient.organization.create({
		name,
		// prefilled names like "My Studio" are shared by many: the slug must not be
		slug: await availableOrganizationSlug(name),
		keepCurrentActiveOrganization: false,
	});
	if (error) throw new Error(error.message ?? "Could not create the organization.");
	await refreshAll();
}
