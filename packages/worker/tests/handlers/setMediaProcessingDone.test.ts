import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJob } from "../helpers.ts";
import { prisma, resetMocks } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);

import { setMediaProcessingDone } from "../../src/handlers/setMediaProcessingDone.ts";

beforeEach(() => {
	resetMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("setMediaProcessingDone", () => {
	it("marks the media as completed", async () => {
		await setMediaProcessingDone(fakeJob("setMediaProcessingDone", { mediaId: "m1" }) as never);
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { status: "COMPLETED" },
		});
	});
});
