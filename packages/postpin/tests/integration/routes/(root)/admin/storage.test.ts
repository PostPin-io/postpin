import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	getStorageOverview,
	listOrganizations,
	listUsers,
	measureImages,
	setOrgQuota,
	setUserQuota,
} from "../../../../../src/routes/(root)/admin/storage.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn } from "../../../../helpers/request-event.ts";
import { storedExport } from "../../../../helpers/storage.ts";
import { fakes } from "../../../../helpers/fakes.ts";

type User = Awaited<ReturnType<typeof f.createUser>>;
let admin: User;

beforeEach(async () => {
	// ADMIN_EMAILS in the test env lists admin@test.local
	admin = await prisma.user.create({
		data: { name: "Admin", email: "admin@test.local", emailVerified: true },
	});
});

describe("access", () => {
	it.each([
		["a regular user", { email: "someone@test.local", emailVerified: true }],
		["an admin with an unverified email", { email: "admin@test.local", emailVerified: false }],
	])("404 for %s", async (_, user) => {
		signIn({ id: "u", name: "U", ...user } as User);
		await expectStatus(listOrganizations(), 404);
		await expectStatus(listUsers(), 404);
		await expectStatus(getStorageOverview(), 404);
		await expectStatus(setOrgQuota({ id: "x", quota: null }), 404);
		await expectStatus(setUserQuota({ id: "x", quota: null }), 404);
	});
});

describe("lists", () => {
	it("shows every organization and user with their usage", async () => {
		const org = await f.createOrg({ name: "Acme" });
		const empty = await f.createOrg({ name: "Empty" });
		const member = await f.createMember(org, Role.MEMBER);
		const timeline = await f.createTimeline(await f.createProject(org));
		await storedExport(timeline, { original: 100, proxies: [20], uploadedBy: member.user });
		await prisma.organization.update({ where: { id: org.id }, data: { storageQuota: 500n } });
		signIn(admin);

		const orgs = await listOrganizations();
		expect(orgs.find((o) => o.id === org.id)).toMatchObject({
			name: "Acme",
			members: 1,
			used: 120n,
			quotaOverride: 500n,
			quota: 500n,
		});
		// no ENV default in the tests, so no override = unlimited
		expect(orgs.find((o) => o.id === empty.id)).toMatchObject({ used: 0n, quota: null });

		const users = await listUsers();
		expect(users.find((u) => u.id === member.user.id)).toMatchObject({
			used: 120n,
			quota: null,
			organizations: [{ id: org.id, name: "Acme" }],
		});
	});
});

describe("setOrgQuota / setUserQuota", () => {
	it("stores parsed sizes and resets to the default with null", async () => {
		const org = await f.createOrg();
		const user = await f.createUser();
		signIn(admin);

		await setOrgQuota({ id: org.id, quota: "20 GB" });
		await setUserQuota({ id: user.id, quota: "1.5 GiB" });
		expect(
			(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).storageQuota,
		).toBe(20_000_000_000n);
		expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).storageQuota).toBe(
			1_610_612_736n,
		);

		await setOrgQuota({ id: org.id, quota: null });
		expect(
			(await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).storageQuota,
		).toBeNull();
	});

	it("rejects invalid sizes", async () => {
		const org = await f.createOrg();
		signIn(admin);
		await expectStatus(setOrgQuota({ id: org.id, quota: "lots" }), 400);
	});
});

describe("getStorageOverview", () => {
	it("returns capacity, usage and allocated quotas", async () => {
		const org = await f.createOrg();
		const timeline = await f.createTimeline(await f.createProject(org));
		await storedExport(timeline, { original: 1000 });
		signIn(admin);

		// an org without a quota makes the sum meaningless
		expect(await getStorageOverview()).toMatchObject({
			capacity: { kind: "fixed", total: 1_000_000_000n },
			used: 1000n,
			defaults: { org: null, user: null },
			allocated: null,
		});

		await prisma.organization.updateMany({ data: { storageQuota: 300n } });
		expect((await getStorageOverview()).allocated).toBe(
			300n * BigInt(await prisma.organization.count()),
		);
	});
});

describe("storage by kind", () => {
	it("splits the usage into originals, proxies and images", async () => {
		const timeline = await f.createTimeline(await f.createProject(await f.createOrg()));
		await storedExport(timeline, {
			original: 1000,
			proxies: [300, 200],
			images: { thumbnail: 1, seekSprites: 20, shotThumbnails: 30 },
		});
		await storedExport(timeline, { original: 7 });
		signIn(admin);

		const overview = await getStorageOverview();
		expect(overview.byKind).toEqual({
			original: 1007n,
			proxy: 500n,
			thumbnail: 1n,
			seekSprites: 20n,
			shotThumbnails: 30n,
		});
		expect(overview.used).toBe(1558n);
		// the second export's images were never measured
		expect(overview.unmeasured).toBe(1);
	});

	it("measureImages lists the folders of unmeasured media and stores the sizes", async () => {
		const timeline = await f.createTimeline(await f.createProject(await f.createOrg()));
		const exp = await storedExport(timeline, { original: 1000 });
		// still processing: its images aren't complete yet
		await storedExport(timeline, { original: 1, status: "PROCESSING" });
		fakes.s3Respond = (call) =>
			call.command === "ListObjectsV2Command"
				? {
						Contents: [
							{ Key: `${exp.mediaId}/original`, Size: 1000 },
							{ Key: `${exp.mediaId}/thumbnail`, Size: 5 },
							{ Key: `${exp.mediaId}/sprite-0`, Size: 60 },
							{ Key: `${exp.mediaId}/shotThumbnails-3`, Size: 7 },
						],
					}
				: {};
		signIn(admin);

		expect(await measureImages()).toEqual({ measured: 1 });
		expect(fakes.s3.map((c) => c.input.Prefix)).toEqual([`${exp.mediaId}/`]);
		expect(
			await prisma.media.findUniqueOrThrow({
				where: { id: exp.mediaId! },
				select: { thumbnailSize: true, seekSpritesSize: true, shotThumbnailsSize: true },
			}),
		).toEqual({ thumbnailSize: 5n, seekSpritesSize: 60n, shotThumbnailsSize: 7n });
		expect((await getStorageOverview()).unmeasured).toBe(0);
	});
});

describe("unusable user quota", () => {
	it("flags the part of a user's quota that their organizations can never hold", async () => {
		const small = await f.createOrg();
		const large = await f.createOrg();
		const member = await f.createMember(small, Role.MEMBER);
		await f.createMember(large, Role.MEMBER, member.user);
		await prisma.organization.update({ where: { id: small.id }, data: { storageQuota: 10n } });
		await prisma.organization.update({ where: { id: large.id }, data: { storageQuota: 20n } });
		await prisma.user.update({ where: { id: member.user.id }, data: { storageQuota: 50n } });
		signIn(admin);

		const find = async () => (await listUsers()).find((u) => u.id === member.user.id)!;
		expect((await find()).unusable).toBe(20n);

		await prisma.user.update({ where: { id: member.user.id }, data: { storageQuota: 30n } });
		expect((await find()).unusable).toBeNull();

		// an unlimited organization can hold any quota
		await prisma.user.update({ where: { id: member.user.id }, data: { storageQuota: 50n } });
		await prisma.organization.update({ where: { id: large.id }, data: { storageQuota: null } });
		expect((await find()).unusable).toBeNull();
	});
});
