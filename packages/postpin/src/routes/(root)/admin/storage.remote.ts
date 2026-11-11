import { prisma } from "#lib/server/database.ts";
import {
	getCapacity,
	orgQuota,
	storageUsageRows,
	sumBy,
	totalUsed,
	userQuota,
} from "#lib/server/storage-usage.ts";
import { requireSystemAdmin } from "#lib/server/system-admin.ts";
import { command, query } from "$app/server";
import { isByteSize, parseByteSize } from "@postpin-io/shared/logic/bytes";
import * as v from "valibot";
import * as env from "$app/env/private";
import { getStorageByKind } from "@postpin-io/shared/db/sql";
import { measureMediaImages } from "@postpin-io/shared/storage";
import { s3Client } from "#lib/server/storage.ts";

export const listOrganizations = query(async () => {
	requireSystemAdmin();
	const [orgs, rows] = await Promise.all([
		prisma.organization.findMany({
			select: {
				id: true,
				name: true,
				slug: true,
				storageQuota: true,
				_count: { select: { members: true } },
			},
			orderBy: { name: "asc" },
		}),
		storageUsageRows(),
	]);
	const used = sumBy(rows, "orgId");
	return orgs.map(({ storageQuota, _count, ...org }) => ({
		...org,
		members: _count.members,
		used: used.get(org.id) ?? 0n,
		quotaOverride: storageQuota,
		quota: orgQuota(storageQuota),
	}));
});

export const listUsers = query(async () => {
	requireSystemAdmin();
	const [users, rows] = await Promise.all([
		prisma.user.findMany({
			select: {
				id: true,
				name: true,
				email: true,
				storageQuota: true,
				memberships: {
					select: { organization: { select: { id: true, name: true, storageQuota: true } } },
					orderBy: { organization: { name: "asc" } },
				},
			},
			orderBy: { name: "asc" },
		}),
		storageUsageRows(),
	]);
	const used = sumBy(rows, "userId");
	return users.map(({ storageQuota, memberships, ...user }) => {
		const quota = userQuota(storageQuota);
		return {
			...user,
			organizations: memberships.map(({ organization: { id, name } }) => ({ id, name })),
			used: used.get(user.id) ?? 0n,
			quotaOverride: storageQuota,
			quota,
			unusable: unusableQuota(
				quota,
				memberships.map((m) => orgQuota(m.organization.storageQuota)),
			),
		};
	});
});

/**
 * The part of a user's quota they can never fill, because all their organizations together allow
 * less. null when everything is usable or one side is unlimited.
 */
function unusableQuota(userQuota: bigint | null, orgQuotas: (bigint | null)[]) {
	if (userQuota === null || orgQuotas.length === 0 || orgQuotas.includes(null)) return null;
	const reachable = orgQuotas.reduce<bigint>((sum, q) => sum + q!, 0n);
	return userQuota > reachable ? userQuota - reachable : null;
}

const QuotaInput = v.object({
	id: v.string(),
	// null = back to the ENV default
	quota: v.nullable(v.pipe(v.string(), v.check(isByteSize, "Enter a size like 50 GB"))),
});

export const setOrgQuota = command(QuotaInput, async ({ id, quota }) => {
	requireSystemAdmin();
	await prisma.organization.update({
		where: { id },
		data: { storageQuota: quota === null ? null : parseByteSize(quota) },
	});
	await Promise.all([
		listOrganizations().refresh(),
		listUsers().refresh(),
		getStorageOverview().refresh(),
	]);
});

export const setUserQuota = command(QuotaInput, async ({ id, quota }) => {
	requireSystemAdmin();
	await prisma.user.update({
		where: { id },
		data: { storageQuota: quota === null ? null : parseByteSize(quota) },
	});
	await listUsers().refresh();
});

export const getStorageOverview = query(async () => {
	requireSystemAdmin();
	const [capacity, rows, orgs, kinds, unmeasured] = await Promise.all([
		getCapacity(),
		storageUsageRows(),
		prisma.organization.findMany({ select: { storageQuota: true } }),
		prisma.$queryRawTyped(getStorageByKind()),
		prisma.media.count({ where: unmeasuredMedia }),
	]);
	const byKind = Object.fromEntries(kinds.map((k) => [k.kind, k.used ?? 0n]));
	const quotas = orgs.map((o) => orgQuota(o.storageQuota));
	return {
		capacity,
		used: totalUsed(rows),
		byKind: {
			original: byKind.original ?? 0n,
			proxy: byKind.proxy ?? 0n,
			thumbnail: byKind.thumbnail ?? 0n,
			seekSprites: byKind.seekSprites ?? 0n,
			shotThumbnails: byKind.shotThumbnails ?? 0n,
		},
		/** Processed media from before image sizes were recorded */
		unmeasured,
		defaults: {
			org: env.STORAGE_DEFAULT_ORG_QUOTA ?? null,
			user: env.STORAGE_DEFAULT_USER_QUOTA ?? null,
		},
		// null when any org is unlimited: the sum would be meaningless
		allocated: quotas.some((q) => q === null)
			? null
			: quotas.reduce<bigint>((sum, q) => sum + q!, 0n),
	};
});

/** Processed media whose images were never measured, e.g. from before image sizes existed */
const unmeasuredMedia = {
	status: { in: ["COMPLETED" as const, "FAILED" as const] },
	OR: [{ thumbnailSize: null }, { seekSpritesSize: null }, { shotThumbnailsSize: null }],
};

/** Lists the bucket folder of every unmeasured media and stores its image sizes */
export const measureImages = command(async () => {
	requireSystemAdmin();
	const media = await prisma.media.findMany({ where: unmeasuredMedia, select: { id: true } });
	let next = 0;
	// a few listings in parallel; each one is a single request for most media
	await Promise.all(
		Array.from({ length: Math.min(4, media.length) }, async () => {
			while (next < media.length) {
				const { id } = media[next++]!;
				const sizes = await measureMediaImages(s3Client, env, id);
				await prisma.media.update({ where: { id }, data: sizes });
			}
		}),
	);
	await Promise.all([
		getStorageOverview().refresh(),
		listOrganizations().refresh(),
		listUsers().refresh(),
	]);
	return { measured: media.length };
});
