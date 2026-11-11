import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeJob } from "../helpers.ts";
import { prisma, resetMocks } from "./mocks.ts";

vi.mock("../../src/lib/database.ts", async () => (await import("./mocks.ts")).database);
const storeImageSizes = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/image-sizes.ts", () => ({ storeImageSizes }));

import { setMediaProcessingDone } from "../../src/handlers/setMediaProcessingDone.ts";

beforeEach(() => {
	resetMocks();
	storeImageSizes.mockReset().mockResolvedValue(undefined);
	vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("setMediaProcessingDone", () => {
	const run = () =>
		setMediaProcessingDone(fakeJob("setMediaProcessingDone", { mediaId: "m1" }) as never);

	it("stores the image sizes and marks the media as completed", async () => {
		await run();
		expect(storeImageSizes).toHaveBeenCalledWith("m1");
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { status: "COMPLETED" },
		});
	});

	it("still completes the media when measuring the images fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		storeImageSizes.mockRejectedValue(new Error("S3 down"));
		await run();
		expect(prisma.media.update).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { status: "COMPLETED" },
		});
	});
});
