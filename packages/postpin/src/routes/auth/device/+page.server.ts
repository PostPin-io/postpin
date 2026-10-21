import { redirect } from "@sveltejs/kit";
import { prisma } from "#lib/server/database.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, `/auth/login?redirect=${encodeURIComponent(`/auth/device${url.search}`)}`);
	}

	const userCode = url.searchParams.get("user_code")?.trim().replace(/-/g, "").toUpperCase();
	if (!userCode) return { deviceName: null };

	const deviceCode = await prisma.deviceCode.findUnique({
		where: { userCode },
		select: { deviceName: true, status: true, userId: true },
	});
	// only reveal the device name for requests this user can still claim or has claimed
	const visible =
		deviceCode?.status === "pending" &&
		(deviceCode.userId === null || deviceCode.userId === locals.user.id);

	return { deviceName: visible ? deviceCode.deviceName : null };
};
