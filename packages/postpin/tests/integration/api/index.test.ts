import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import { POSTPIN_API_VERSION } from "@postpin-io/shared/api-version";
import { handleApiRequest } from "../../../src/api/index.ts";
import { prisma } from "../../helpers/db.ts";
import * as f from "../../helpers/factories.ts";
import { fakes } from "../../helpers/fakes.ts";
import { fakeRequestEvent, signInApi } from "../../helpers/api.ts";
import { apiWorld, signInAs, type ApiWorld } from "../../helpers/api-world.ts";

/**
 * HTTP-level tests through hapi: authentication, error mapping and (de)serialization.
 * Authorization rules per role are covered by the controller tests.
 */

let w: ApiWorld;

beforeEach(async () => {
	w = await apiWorld();
	// the server logs every Boom response
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
	const { json, ...rest } = init;
	const event = fakeRequestEvent(path, {
		...rest,
		...(json !== undefined
			? {
					body: JSON.stringify(json),
					headers: { "content-type": "application/json", ...rest.headers },
				}
			: {}),
	});
	const res = await handleApiRequest(event);
	const text = await res.text();
	const body = res.headers.get("content-type")?.includes("json") && text ? JSON.parse(text) : text;
	return { res, status: res.status, body };
}

const exportsPath = () => `/api/v1/projects/${w.projectA.id}/timelines/${w.tl1.id}/exports`;

describe("authentication", () => {
	it("401 without a session", async () => {
		const { status, body } = await call("/api/v1/projects");
		expect(status).toBe(401);
		expect(body).toMatchObject({ name: "HttpError", message: "Not signed in" });
	});

	it("401 with a user but no session", async () => {
		await signInApi(w.owner.user, w.org.id);
		const event = fakeRequestEvent("/api/v1/projects");
		event.locals.session = null;
		const res = await handleApiRequest(event);
		expect(res.status).toBe(401);
	});

	it("the OpenAPI spec and docs need no session", async () => {
		const spec = await call("/api/v1/openapi.json");
		expect(spec.status).toBe(200);
		expect(spec.body.openapi).toMatch(/^3\./);
		const docs = await call("/api/v1/docs");
		expect(docs.status).toBe(200);
		expect(docs.body).toContain("PostPin OpenAPI Docs");
	});
});

describe("API version check", () => {
	const current = String(POSTPIN_API_VERSION);
	const older = String(POSTPIN_API_VERSION - 1);
	const newer = String(POSTPIN_API_VERSION + 1);

	it("426 for an older plugin, with both versions and CORS headers", async () => {
		await signInApi(w.owner.user, w.org.id);
		const { res, status, body } = await call("/api/v1/projects", {
			headers: { "x-postpin-api-version": older, origin: "null" },
		});
		expect(status).toBe(426);
		expect(body).toMatchObject({
			name: "HttpError",
			serverApiVersion: POSTPIN_API_VERSION,
			serverRelease: "test",
			clientApiVersion: POSTPIN_API_VERSION - 1,
		});
		expect(body.message).toContain("Update the plugin.");
		expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
	});

	it("426 for a newer plugin asks for a server update", async () => {
		const { status, body } = await call("/api/v1/projects", {
			headers: { "x-postpin-api-version": newer },
		});
		expect(status).toBe(426);
		expect(body.message).toContain("Update the PostPin server");
	});

	it("426 for a version that isn't an integer", async () => {
		const { status, body } = await call("/api/v1/projects", {
			headers: { "x-postpin-api-version": "1.0.0" },
		});
		expect(status).toBe(426);
		expect(body.clientApiVersion).toBe("1.0.0");
	});

	it("426 comes before authentication, so a plugin learns it before signing in", async () => {
		const { status } = await call("/api/v1/projects", {
			headers: { "x-postpin-api-version": older },
		});
		expect(status).toBe(426);
	});

	it("passes the same API version and requests without the header", async () => {
		await signInApi(w.owner.user, w.org.id);
		expect(
			(await call("/api/v1/projects", { headers: { "x-postpin-api-version": current } })).status,
		).toBe(200);
		expect((await call("/api/v1/projects")).status).toBe(200);
	});

	it("CORS preflights allow the API version header", async () => {
		const event = fakeRequestEvent("/api/v1/projects", {
			method: "OPTIONS",
			headers: {
				origin: "null",
				"access-control-request-method": "GET",
				"access-control-request-headers": "authorization,x-postpin-api-version",
			},
		});
		const res = await handleApiRequest(event);
		expect(res.status).toBe(200);
		expect(res.headers.get("access-control-allow-headers")?.toLowerCase()).toContain(
			"x-postpin-api-version",
		);
	});
});

describe("responses", () => {
	it("happy path: lists projects as JSON", async () => {
		await signInApi(w.owner.user, w.org.id);
		const { status, body } = await call("/api/v1/projects");
		expect(status).toBe(200);
		expect(body.map((p: { id: string }) => p.id).sort()).toEqual(
			[w.projectA.id, w.projectB.id].sort(),
		);
		expect(body[0].organization).toEqual({ id: w.org.id, name: w.org.name });
	});

	it("reads the JSON body: creates a category", async () => {
		await signInApi(w.owner.user, w.org.id);
		const { status, body } = await call(`/api/v1/projects/${w.projectA.id}/categories`, {
			method: "PUT",
			json: { name: "Dialog", color: "#abcdef" },
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({ name: "Dialog", color: "#ABCDEF", projectId: w.projectA.id });
	});

	it("void operations answer 204 without a body", async () => {
		const exp = await f.createExport(w.tl1, { media: true });
		await signInApi(w.owner.user, w.org.id);
		const { res, status } = await call(`${exportsPath()}/${exp.id}/abort-upload`, {
			method: "POST",
			json: { uploadId: "u" },
		});
		expect(status).toBe(204);
		expect(res.body).toBeNull();
		expect(fakes.s3.map((c) => c.command)).toEqual(["AbortMultipartUploadCommand"]);
	});

	it("unknown routes are 404", async () => {
		await signInApi(w.owner.user, w.org.id);
		expect((await call("/api/v1/nope")).status).toBe(404);
	});

	it("answers CORS preflights for any origin, also Origin: null (file://)", async () => {
		const { res, status } = await call("/api/v1/projects", {
			method: "OPTIONS",
			headers: { origin: "null", "access-control-request-method": "GET" },
		});
		expect(status).toBeLessThan(300);
		expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
	});
});

describe("errors", () => {
	it("404 from authorize() keeps its status", async () => {
		await signInApi(w.owner.user, w.org.id);
		const { status, body } = await call(`/api/v1/projects/${w.otherProject.id}`);
		expect(status).toBe(404);
		expect(body).toMatchObject({ name: "HttpError", message: "Not found" });
	});

	it("403 from authorize() keeps its status", async () => {
		await signInAs(w, Role.REVIEWER, { projectId: w.projectA.id });
		const { status, body } = await call(exportsPath(), {
			method: "POST",
			json: { nleTimelineId: null, nleProjectId: null },
		});
		expect(status).toBe(403);
		expect(body).toMatchObject({ message: "Not allowed" });
		expect(await prisma.export.count()).toBe(4);
	});

	it("HttpErrors thrown by controllers keep their status", async () => {
		await signInApi(w.owner.user, w.org.id);
		const { status } = await call(`${exportsPath()}/${w.exp1.id}/init-upload`, {
			method: "POST",
			json: { fileSize: 0 },
		});
		expect(status).toBe(400);
	});

	it("400 when the body doesn't match the schema", async () => {
		await signInApi(w.owner.user, w.org.id);
		const missing = await call(`/api/v1/projects/${w.projectA.id}/categories`, {
			method: "PUT",
			json: { name: "X" },
		});
		expect(missing.status).toBe(400);
		const extra = await call(`/api/v1/projects/${w.projectA.id}/categories`, {
			method: "PUT",
			json: { name: "X", color: "#000000", admin: true },
		});
		expect(extra.status).toBe(400);
		expect(await prisma.category.count({ where: { projectId: w.projectA.id } })).toBe(1);
	});

	it("500s don't leak internals", async () => {
		// S3 answers without an UploadId, so createMultipartUpload throws a plain Error
		await signInApi(w.owner.user, w.org.id);
		const { status, body } = await call(`${exportsPath()}/${w.exp1.id}/init-upload`, {
			method: "POST",
			json: { fileSize: 1 },
		});
		expect(status).toBe(500);
		expect(body).toEqual({
			statusCode: 500,
			error: "Internal Server Error",
			message: "Internal server error",
		});
	});
});
