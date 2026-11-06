import { expect, it } from "vitest";
import { SpecController } from "../../../../src/api/controllers/SpecController.ts";

const controller = new SpecController();

it("serves the generated OpenAPI spec with every API route", async () => {
	const spec = (await controller.getOpenApiSpec()) as {
		openapi: string;
		paths: Record<string, unknown>;
	};
	expect(spec.openapi).toMatch(/^3\./);
	expect(Object.keys(spec.paths)).toEqual(
		expect.arrayContaining([
			"/v1/projects",
			"/v1/projects/{projectId}",
			"/v1/projects/{projectId}/categories",
			"/v1/projects/{projectId}/timelines/{timelineId}/exports",
			"/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers",
		]),
	);
});

it("serves the docs page", async () => {
	const html = await controller.getDocsHtml();
	expect(html).toMatch(/^<!doctype html>/i);
	expect(html).toContain("PostPin OpenAPI Docs");
});
