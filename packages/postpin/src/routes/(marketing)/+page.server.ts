import { redirect } from "@sveltejs/kit";
import { LANDING_PAGE } from "$app/env/private";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals, url }) => {
	// /?about: "About PostPin" in the organization settings. Signed-in users see the landing page
	// then instead of being sent back to the dashboard, also where it is off for visitors
	// (self-hosted), since it only explains the product.
	if (locals.user && url.searchParams.has("about")) return { signedIn: true };
	if (locals.user) redirect(303, "/dashboard");
	if (!LANDING_PAGE) redirect(303, "/auth/login");
	return { signedIn: false };
};
