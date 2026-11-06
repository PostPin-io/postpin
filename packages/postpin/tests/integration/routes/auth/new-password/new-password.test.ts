import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getEmail } from "../../../../../src/routes/auth/new-password/new-password.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";

type User = Awaited<ReturnType<typeof f.createUser>>;
let user: User;

beforeEach(async () => {
	user = await f.createUser({ email: "reset@test.local" });
});

/** Same shape better-auth's requestPasswordReset stores */
async function resetToken(u: { id: string }, expiresAt = new Date(Date.now() + 3_600_000)) {
	const token = randomUUID();
	await prisma.verification.create({
		data: { id: randomUUID(), identifier: `reset-password:${token}`, value: u.id, expiresAt },
	});
	return token;
}

describe("getEmail", () => {
	it("returns the e-mail of the user the reset token belongs to", async () => {
		await resetToken(await f.createUser());
		const token = await resetToken(user);
		expect(await getEmail(token)).toBe("reset@test.local");
	});

	it("doesn't accept other verification types with the same value", async () => {
		const token = randomUUID();
		await prisma.verification.create({
			data: {
				id: randomUUID(),
				identifier: token,
				value: user.id,
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		await expect(getEmail(token)).rejects.toThrow();
	});

	it("400 for a non-string token", async () => {
		await expectStatus(getEmail(1 as never), 400);
	});

	it("404 for an unknown token", async () => {
		await expectStatus(getEmail("nope"), 404);
	});

	it("404 for an expired token", async () => {
		const token = await resetToken(user, new Date(Date.now() - 1000));
		await expectStatus(getEmail(token), 404);
	});
});
