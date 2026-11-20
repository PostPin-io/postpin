import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, DELETE_WITHOUT_PASSWORD_MAX_AGE_MS } from "#lib/server/auth.ts";
import { prisma } from "../../../helpers/db.ts";
import * as f from "../../../helpers/factories.ts";

/** A real better-auth session in the DB; its token works as a bearer token */
async function createSession(
	user: { id: string },
	data: { createdAt?: Date; clientId?: string } = {},
) {
	const token = randomUUID().replaceAll("-", "");
	await prisma.session.create({
		data: {
			id: randomUUID(),
			token,
			userId: user.id,
			expiresAt: new Date(Date.now() + 7 * 86_400_000),
			...data,
		},
	});
	return new Headers({ authorization: `Bearer ${token}` });
}

async function addAccount(user: { id: string }, providerId: string) {
	await prisma.account.create({
		data: { id: randomUUID(), accountId: randomUUID(), providerId, userId: user.id },
	});
}

const deleteUser = (headers: Headers) => auth.api.deleteUser({ headers, body: {} });

beforeEach(() => {
	// the goodbye mail has no SMTP server to go to
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("delete-user without a password", () => {
	it("is refused for accounts that have a password", async () => {
		const user = await f.createUser();
		await addAccount(user, "credential");
		const headers = await createSession(user);

		await expect(deleteUser(headers)).rejects.toThrow("Enter your password");
		expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
	});

	it("deletes an SSO-only account right after signing in", async () => {
		const user = await f.createUser();
		await addAccount(user, "google");
		const headers = await createSession(user);

		await deleteUser(headers);
		expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
	});

	it("asks an SSO-only account to sign in again once the session is older", async () => {
		const user = await f.createUser();
		await addAccount(user, "google");
		const headers = await createSession(user, {
			createdAt: new Date(Date.now() - DELETE_WITHOUT_PASSWORD_MAX_AGE_MS - 1000),
		});

		await expect(deleteUser(headers)).rejects.toThrow("Sign in again");
		expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
	});

	it("refuses desktop/plugin sessions, however fresh", async () => {
		const user = await f.createUser();
		await addAccount(user, "google");
		const headers = await createSession(user, { clientId: "postpin-desktop" });

		await expect(deleteUser(headers)).rejects.toThrow("Sign in again");
		expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
	});
});
