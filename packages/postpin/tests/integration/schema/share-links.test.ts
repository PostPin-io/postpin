import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../helpers/db.ts";
import * as f from "../../helpers/factories.ts";

async function world() {
	const org = await f.createOrg();
	const user = await f.createUser();
	const project = await f.createProject(org);
	const timeline = await f.createTimeline(project);
	const exp = await f.createExport(timeline);
	const category = await f.createCategory(project);
	const link = await f.createShareLink(exp, { creator: user });
	const guest = await f.createShareGuest(link);
	return { user, project, exp, category, link, guest };
}

let w: Awaited<ReturnType<typeof world>>;

beforeEach(async () => {
	w = await world();
});

describe("marker authors", () => {
	it("allows a guest as the only author", async () => {
		const m = await f.createMarker(w.exp, w.category, { guest: w.guest });
		expect(m).toMatchObject({ guestId: w.guest.id, authorId: null });
	});

	it("allows no author (NLE import, deleted user)", async () => {
		const m = await f.createMarker(w.exp, w.category);
		expect(m).toMatchObject({ guestId: null, authorId: null });
	});

	it("rejects a user and a guest as authors at once", async () => {
		await expect(
			f.createMarker(w.exp, w.category, { author: w.user, guest: w.guest }),
		).rejects.toThrow(/marker_at_most_one_author/);
	});
});

describe("cascades", () => {
	it("deleting a share link deletes its guests and keeps their markers", async () => {
		const m = await f.createMarker(w.exp, w.category, { guest: w.guest });
		await prisma.shareLink.delete({ where: { id: w.link.id } });

		expect(await prisma.shareGuest.findUnique({ where: { id: w.guest.id } })).toBeNull();
		expect(await prisma.marker.findUnique({ where: { id: m.id } })).toMatchObject({
			guestId: null,
		});
	});

	it("deleting a link's category unsets it on the link", async () => {
		await prisma.shareLink.update({
			where: { id: w.link.id },
			data: { categoryId: w.category.id },
		});
		await prisma.category.delete({ where: { id: w.category.id } });

		expect(await prisma.shareLink.findUnique({ where: { id: w.link.id } })).toMatchObject({
			categoryId: null,
		});
	});
});
