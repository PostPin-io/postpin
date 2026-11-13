import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	assertQuota,
	getCapacity,
	getOrgUsage,
	getUserUsage,
	QuotaExceededError,
	storageUsageRows,
	sumBy,
} from "../../../../src/lib/server/storage-usage.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";
import { storedExport } from "../../../helpers/storage.ts";

const HOUR = 60 * 60 * 1000;

type Timeline = Awaited<ReturnType<typeof f.createTimeline>>;
type Org = Awaited<ReturnType<typeof f.createOrg>>;
type User = Awaited<ReturnType<typeof f.createUser>>;

let orgA: Org, orgB: Org;
let alice: User, bob: User;
let tlA: Timeline, tlB: Timeline;

beforeEach(async () => {
	orgA = await f.createOrg();
	orgB = await f.createOrg();
	alice = (await f.createMember(orgA, Role.MEMBER)).user;
	bob = (await f.createMember(orgA, Role.MEMBER)).user;
	await f.createMember(orgB, Role.MEMBER, alice);
	tlA = await f.createTimeline(await f.createProject(orgA));
	tlB = await f.createTimeline(await f.createProject(orgB));
});

describe("usage", () => {
	it("counts the original and all proxies", async () => {
		await storedExport(tlA, { original: 1000, proxies: [300, 200, 100], uploadedBy: alice });
		expect(await getOrgUsage(orgA.id)).toBe(1600n);
	});

	it("counts the measured images too", async () => {
		await storedExport(tlA, {
			original: 1000,
			proxies: [100],
			images: { thumbnail: 1, seekSprites: 20, shotThumbnails: 300 },
		});
		expect(await getOrgUsage(orgA.id)).toBe(1421n);
	});

	it("sums per organization and per uploader across organizations", async () => {
		await storedExport(tlA, { original: 100, uploadedBy: alice });
		await storedExport(tlA, { original: 20, uploadedBy: bob });
		await storedExport(tlB, { original: 3, uploadedBy: alice });

		expect(await getOrgUsage(orgA.id)).toBe(120n);
		expect(await getOrgUsage(orgB.id)).toBe(3n);
		expect(await getUserUsage(alice.id)).toBe(103n);
		expect(await getUserUsage(bob.id)).toBe(20n);

		const rows = await storageUsageRows();
		expect(sumBy(rows, "orgId").get(orgA.id)).toBe(120n);
		expect(sumBy(rows, "userId").get(alice.id)).toBe(103n);
	});

	it("counts exports without an uploader for the organization only", async () => {
		await storedExport(tlA, { original: 50 });
		expect(await getOrgUsage(orgA.id)).toBe(50n);
		expect(sumBy(await storageUsageRows(), "userId").size).toBe(0);
	});

	it("counts pending uploads while their reservation lasts", async () => {
		await storedExport(tlA, { original: 10, status: "PENDING" });
		await storedExport(tlA, {
			original: 1000,
			status: "PENDING",
			reservedUntil: new Date(Date.now() - HOUR),
		});
		// an old upload whose reservation was renewed (resume-upload) still counts
		await storedExport(tlA, {
			original: 20,
			status: "PENDING",
			createdAt: new Date(Date.now() - 25 * HOUR),
			reservedUntil: new Date(Date.now() + HOUR),
		});
		// failed processing still occupies its files, however old
		await storedExport(tlA, {
			original: 5,
			status: "FAILED",
			createdAt: new Date(Date.now() - 25 * HOUR),
		});
		expect(await getOrgUsage(orgA.id)).toBe(35n);
	});

	it("leaves out the excluded media", async () => {
		const exp = await storedExport(tlA, { original: 100, uploadedBy: alice });
		await storedExport(tlA, { original: 7, uploadedBy: alice });
		expect(await getOrgUsage(orgA.id, exp.mediaId!)).toBe(7n);
		expect(await getUserUsage(alice.id, exp.mediaId!)).toBe(7n);
	});

	it("is 0 for an organization without media", async () => {
		expect(await getOrgUsage(orgA.id)).toBe(0n);
	});
});

describe("assertQuota", () => {
	const check = (additional: number, excludeMediaId?: string) =>
		assertQuota({
			orgId: orgA.id,
			userId: alice.id,
			additional: BigInt(additional),
			excludeMediaId,
		});

	it("passes without quotas", async () => {
		await storedExport(tlA, { original: 10 ** 12, uploadedBy: alice });
		await expect(check(10 ** 12)).resolves.toBeUndefined();
	});

	it("rejects an upload over the organization quota", async () => {
		await prisma.organization.update({ where: { id: orgA.id }, data: { storageQuota: 100n } });
		await storedExport(tlA, { original: 90, uploadedBy: bob });
		await expect(check(10)).resolves.toBeUndefined();
		await expect(check(11)).rejects.toThrow(QuotaExceededError);
		await expect(check(11)).rejects.toThrow(/^Organization storage is full: 90 B of 100 B used/);
	});

	it("rejects an upload over the user's quota, counting other organizations", async () => {
		await prisma.user.update({ where: { id: alice.id }, data: { storageQuota: 100n } });
		await storedExport(tlB, { original: 95, uploadedBy: alice });
		await expect(check(6)).rejects.toThrow(/^Your storage is full/);
		// bob's quota is untouched
		await expect(
			assertQuota({ orgId: orgA.id, userId: bob.id, additional: 1000n }),
		).resolves.toBeUndefined();
	});

	it("doesn't count the reservation that a retry replaces", async () => {
		await prisma.organization.update({ where: { id: orgA.id }, data: { storageQuota: 100n } });
		const exp = await storedExport(tlA, { original: 80, uploadedBy: alice, status: "PENDING" });
		await expect(check(80)).rejects.toThrow(QuotaExceededError);
		await expect(check(80, exp.mediaId!)).resolves.toBeUndefined();
	});
});

describe("getCapacity", () => {
	it("uses STORAGE_CAPACITY when set", async () => {
		expect(await getCapacity()).toEqual({ kind: "fixed", total: 1_000_000_000n });
	});
});
