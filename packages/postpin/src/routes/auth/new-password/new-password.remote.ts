import { prisma } from "#lib/server/database.ts";
import { query } from "$app/server";
import * as valibot from "valibot";

export const getEmail = query(valibot.string(), async (token) => {
	const verification = await prisma.verification.findFirstOrThrow({
		where: { identifier: `reset-password:${token}` },
	});
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: verification.value },
	});
	return user.email;
});
