import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJob } from "../helpers.ts";
import { prisma, resetMocks } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);

import { cleanup } from "../../src/handlers/cleanup.ts";

const NOW = new Date("2026-11-13T03:00:00Z");

beforeEach(() => {
	resetMocks();
	vi.useFakeTimers({ now: NOW });
	vi.spyOn(console, "log").mockImplementation(() => {});
	prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
	for (const m of [prisma.session, prisma.deviceCode, prisma.verification, prisma.invitation])
		m.deleteMany.mockResolvedValue({ count: 2 });
});
afterEach(() => vi.useRealTimers());

describe("cleanup", () => {
	const run = () => cleanup(fakeJob("cleanup", {}) as never);

	it("deletes expired sessions, device codes and verifications right away", async () => {
		await run();
		for (const m of [prisma.session, prisma.deviceCode, prisma.verification])
			expect(m.deleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: NOW } } });
	});

	it("keeps expired invitations for 30 days", async () => {
		await run();
		expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
			where: { expiresAt: { lt: new Date("2026-10-14T03:00:00Z") } },
		});
	});

	it("returns what it deleted", async () => {
		await expect(run()).resolves.toEqual({
			sessions: 2,
			deviceCodes: 2,
			verifications: 2,
			invitations: 2,
		});
	});
});
