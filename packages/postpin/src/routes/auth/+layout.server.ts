import { signInProviders } from "#lib/server/auth-providers.ts";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = () => ({ providers: signInProviders() });
