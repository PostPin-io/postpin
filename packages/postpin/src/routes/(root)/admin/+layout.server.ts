import { requireSystemAdmin } from "#lib/server/system-admin.ts";

// the remote functions check too; this only hides the pages themselves
export const load = () => {
	requireSystemAdmin();
};
