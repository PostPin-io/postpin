import { redirect } from "@sveltejs/kit";
import { LANDING_PAGE } from "$app/env/private";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, "/dashboard");
	if (!LANDING_PAGE) redirect(303, "/auth/login");
};
