import { describe, expect, it, vi } from "vitest";
import { JobWeights } from "@postpin-io/shared/queue";

vi.mock("../../src/lib/database.ts", () => ({ prisma: {} }));
vi.mock("../../src/lib/storage.ts", () => ({ s3Client: {}, getOriginalUrl: vi.fn() }));
vi.mock("../../src/lib/env.ts", () => ({ env: {} }));

import { heavyHandlers, lightHandlers } from "../../src/lib/queue.ts";
import { queues } from "../../src/lib/config.ts";

describe("queue handlers", () => {
	it("has exactly one handler per known job name across both queues", () => {
		const names = [...Object.keys(heavyHandlers), ...Object.keys(lightHandlers)].sort();
		expect(names).toEqual(Object.keys(JobWeights).sort());
		for (const handler of [...Object.values(heavyHandlers), ...Object.values(lightHandlers)]) {
			expect(handler).toBeTypeOf("function");
		}
	});

	it("runs heavy jobs one at a time", () => {
		expect(queues["media-heavy"].concurrency).toBe(1);
		expect(queues["media-light"].concurrency).toBeGreaterThan(1);
	});
});
