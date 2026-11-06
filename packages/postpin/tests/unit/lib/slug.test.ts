import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkSlug } = vi.hoisted(() => ({ checkSlug: vi.fn() }));
vi.mock("#lib/auth-client.ts", () => ({ authClient: { organization: { checkSlug } } }));

const { availableOrganizationSlug, slugify } = await import("#lib/slug.ts");

describe("slugify", () => {
	it.each([
		["Acme", "acme"],
		["Acme Studios GmbH", "acme-studios-gmbh"],
		["  Leading and trailing  ", "leading-and-trailing"],
		["Müller & Söhne", "muller-sohne"],
		["Café Crème", "cafe-creme"],
		["a---b", "a-b"],
		["a_b.c/d", "abcd"],
		["Tab\tand\nnewline", "tab-and-newline"],
		["-dash-", "dash"],
		["日本語", ""],
		["", ""],
	])("%j → %j", (input, slug) => {
		expect(slugify(input)).toBe(slug);
	});

	it("only ever produces [a-z0-9-] without leading/trailing dashes", () => {
		for (const s of ["Ωmega ½ ﬁ", "  --x--  ", "ÅÄÖ åäö", "🎬 Film"]) {
			expect(slugify(s)).toMatch(/^([a-z0-9]+(-[a-z0-9]+)*)?$/);
		}
	});
});

describe("availableOrganizationSlug", () => {
	beforeEach(() => {
		checkSlug.mockReset();
	});

	const taken = (...slugs: string[]) =>
		checkSlug.mockImplementation(async (arg: { slug: string }) => ({
			data: { status: !slugs.includes(arg.slug) },
		}));

	it("returns the plain slug when free", async () => {
		taken();
		expect(await availableOrganizationSlug("Acme")).toBe("acme");
	});

	it("appends -2, -3, … on collisions", async () => {
		taken("acme", "acme-2");
		expect(await availableOrganizationSlug("Acme")).toBe("acme-3");
	});

	it("keeps the current slug without asking the server", async () => {
		taken("acme");
		expect(await availableOrganizationSlug("Acme", "acme")).toBe("acme");
		expect(checkSlug).not.toHaveBeenCalled();
	});

	it("falls back to 'organization' when the name has no usable characters", async () => {
		taken();
		expect(await availableOrganizationSlug("日本語")).toBe("organization");
	});

	it("treats a failed check (no data) as taken", async () => {
		checkSlug.mockResolvedValueOnce({ data: null }).mockResolvedValue({ data: { status: true } });
		expect(await availableOrganizationSlug("Acme")).toBe("acme-2");
	});

	it("gives up after 49 attempts", async () => {
		checkSlug.mockResolvedValue({ data: { status: false } });
		await expect(availableOrganizationSlug("Acme")).rejects.toThrow(/free URL/);
		expect(checkSlug).toHaveBeenCalledTimes(49);
	});
});
