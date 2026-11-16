import { redirect } from "@sveltejs/kit";
import { LANDING_PAGE } from "$app/env/private";
import type { PageServerLoad } from "./$types";

// The versions of the landing page side by side, to compare them. Unlike /, they open when signed
// in too.
export const load: PageServerLoad = () => {
	if (!LANDING_PAGE) redirect(303, "/auth/login");
};
