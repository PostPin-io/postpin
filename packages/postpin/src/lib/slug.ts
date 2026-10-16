import { authClient } from "#lib/auth-client.ts";

export function slugify(name: string) {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Slug for `name` that no other organization uses yet, adding -2, -3, … on collisions. */
export async function availableOrganizationSlug(name: string, currentSlug?: string) {
	const base = slugify(name) || "organization";
	for (let i = 1; i < 50; i++) {
		const slug = i === 1 ? base : `${base}-${i}`;
		if (slug === currentSlug) return slug;
		const { data } = await authClient.organization.checkSlug({ slug });
		if (data?.status) return slug;
	}
	throw new Error("Could not find a free URL for this name.");
}
