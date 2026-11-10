import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent, params }) => {
	const { canEditSettings } = await parent();
	if (!canEditSettings) redirect(307, `/organizations/${params.organization}/settings/members`);
};
