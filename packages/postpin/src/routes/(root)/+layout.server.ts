import { isSystemAdmin } from "#lib/server/system-admin.ts";
export const load = ({ locals }) => ({ isSystemAdmin: isSystemAdmin(locals.user) });
