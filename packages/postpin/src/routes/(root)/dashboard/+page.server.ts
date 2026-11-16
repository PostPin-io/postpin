import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => {
	// A fresh account has nothing to see here yet: the tutorial sets up the first organization.
	// Skipping it ends the redirect.
	if (locals.user && locals.user.memberships.length === 0 && !locals.user.tutorialCompletedAt) {
		redirect(303, "/welcome");
	}
};
