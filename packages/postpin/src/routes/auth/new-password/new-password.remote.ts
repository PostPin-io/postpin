import { prisma } from "#lib/server/database.ts";
import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import * as valibot from "valibot";

export const getEmail = query(valibot.string(), async (token) => {
	const verification = await prisma.verification.findFirst({
		where: { identifier: `reset-password:${token}` },
	});
	if (!verification) {
		error(404, "Invalid or expired token");
	}
	if (verification.expiresAt < new Date()) {
		error(404, "Invalid or expired token");
	}
	const user = await prisma.user.findUnique({
		where: { id: verification.value },
	});
	if (!user) {
		error(404, "User not found");
	}
	return user.email;
});
