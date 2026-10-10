import { auth } from "#lib/server/auth.ts"; // path to your auth file
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/env";

export async function handle({ event, resolve }) {
	return svelteKitHandler({ event, resolve, auth, building });
}
