import { statfs } from "node:fs/promises";
import * as env from "$app/env/private";
import { getStorageUsage } from "@postpin-io/shared/db/sql";
import { formatByteSize } from "@postpin-io/shared/logic/bytes";
import { prisma } from "./database";

type Filter = { orgId?: string; userId?: string; excludeMediaId?: string };

/** One row per (organization, uploader). */
export function storageUsageRows({ orgId, userId, excludeMediaId }: Filter = {}) {
	return prisma.$queryRawTyped(
		getStorageUsage(orgId ?? null, userId ?? null, excludeMediaId ?? null),
	);
}

/** Sums rows by key, e.g. sumBy(rows, "orgId") for the admin list. */
export function sumBy<K extends "orgId" | "userId">(rows: getStorageUsage.Result[], key: K) {
	const totals = new Map<string, bigint>();
	for (const row of rows) {
		const id = row[key];
		if (id) totals.set(id, (totals.get(id) ?? 0n) + (row.used ?? 0n));
	}
	return totals;
}

export const totalUsed = (rows: { used: bigint | null }[]) =>
	rows.reduce((sum, r) => sum + (r.used ?? 0n), 0n);

export const getOrgUsage = async (orgId: string, excludeMediaId?: string) =>
	totalUsed(await storageUsageRows({ orgId, excludeMediaId }));

export const getUserUsage = async (userId: string, excludeMediaId?: string) =>
	totalUsed(await storageUsageRows({ userId, excludeMediaId }));

/** null = unlimited */
export function effectiveQuota(
	override: bigint | null,
	fallback: bigint | undefined,
): bigint | null {
	return override ?? fallback ?? null;
}

export const orgQuota = (override: bigint | null) =>
	effectiveQuota(override, env.STORAGE_DEFAULT_ORG_QUOTA);
export const userQuota = (override: bigint | null) =>
	effectiveQuota(override, env.STORAGE_DEFAULT_USER_QUOTA);

export class QuotaExceededError extends Error {}

/** Throws QuotaExceededError when `additional` bytes don't fit the org's or the user's quota. */
export async function assertQuota(a: {
	orgId: string;
	userId: string;
	additional: bigint;
	excludeMediaId?: string;
}) {
	const [org, user, orgUsed, userUsed] = await Promise.all([
		prisma.organization.findUniqueOrThrow({
			where: { id: a.orgId },
			select: { storageQuota: true },
		}),
		prisma.user.findUniqueOrThrow({ where: { id: a.userId }, select: { storageQuota: true } }),
		getOrgUsage(a.orgId, a.excludeMediaId),
		getUserUsage(a.userId, a.excludeMediaId),
	]);
	const check = (label: string, used: bigint, quota: bigint | null) => {
		if (quota !== null && used + a.additional > quota) {
			throw new QuotaExceededError(
				`${label} storage is full: ${formatByteSize(used)} of ${formatByteSize(quota)} used, ` +
					`this upload needs ${formatByteSize(a.additional)}`,
			);
		}
	};
	check("Organization", orgUsed, orgQuota(org.storageQuota));
	check("Your", userUsed, userQuota(user.storageQuota));
}

export type Capacity =
	{ kind: "fixed"; total: bigint } | { kind: "disk"; total: bigint; free: bigint } | null;

export async function getCapacity(): Promise<Capacity> {
	if (env.STORAGE_CAPACITY !== undefined) return { kind: "fixed", total: env.STORAGE_CAPACITY };
	if (!env.STORAGE_DISK_PATH) return null;
	const s = await statfs(env.STORAGE_DISK_PATH, { bigint: true });
	return { kind: "disk", total: s.blocks * s.bsize, free: s.bavail * s.bsize };
}
