import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ getProjects: vi.fn(), getProject: vi.fn() }));
vi.mock("@postpin-io/api-client-ts", () => api);

import { loadProjectsWithTimelines } from "../src/projects.ts";
import type { Client } from "@postpin-io/api-client-ts/client";

const client = {} as Client;

beforeEach(() => {
	api.getProjects.mockReset();
	api.getProject.mockReset();
});

describe("loadProjectsWithTimelines", () => {
	it("loads each listed project and keeps the organization from the list", async () => {
		api.getProjects.mockResolvedValue({
			data: [
				{ id: "p1", organization: { id: "o1" } },
				{ id: "p2", organization: { id: "o2" } },
			],
		});
		api.getProject.mockImplementation(async ({ path }) => ({
			data: { id: path.projectId, timelines: [`${path.projectId}-t`] },
		}));

		await expect(loadProjectsWithTimelines(client)).resolves.toEqual([
			{ id: "p1", timelines: ["p1-t"], organization: { id: "o1" } },
			{ id: "p2", timelines: ["p2-t"], organization: { id: "o2" } },
		]);
		expect(api.getProjects).toHaveBeenCalledWith({ client, throwOnError: true });
		expect(api.getProject).toHaveBeenCalledWith({ client, path: { projectId: "p1" } });
	});

	it("leaves out projects that fail to load", async () => {
		api.getProjects.mockResolvedValue({
			data: [
				{ id: "p1", organization: {} },
				{ id: "p2", organization: {} },
			],
		});
		api.getProject.mockImplementation(async ({ path }) =>
			path.projectId === "p1"
				? { data: undefined, error: { message: "Forbidden" } }
				: { data: { id: "p2" } },
		);
		await expect(loadProjectsWithTimelines(client)).resolves.toEqual([
			{ id: "p2", organization: {} },
		]);
	});

	it("returns an empty list without projects", async () => {
		api.getProjects.mockResolvedValue({ data: [] });
		await expect(loadProjectsWithTimelines(client)).resolves.toEqual([]);
	});

	it("fails when the project list fails", async () => {
		api.getProjects.mockRejectedValue({ message: "Unauthorized" });
		await expect(loadProjectsWithTimelines(client)).rejects.toEqual({ message: "Unauthorized" });
	});
});
