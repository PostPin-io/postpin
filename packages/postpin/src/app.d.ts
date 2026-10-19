// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user:
				| import("@postpin-io/shared/db").Prisma.UserGetPayload<{
						include: { memberships: true };
				  }>
				| null;
			session: (typeof import("#lib/server/auth.ts").auth.$Infer.Session)["session"] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
