import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GuideStatus, Role } from "@postpin-io/shared/db/enums";
import {
	getGuideAvailability,
	getGuideStart,
	getGuideProgress,
	getGuidesEnabled,
	getPluginSignIn,
	getPluginTutorial,
	restartGuide,
	saveGuideProgress,
	setGuidesEnabled,
} from "#lib/components/guides/guides.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { STARTED, COMPLETED, SKIPPED } = GuideStatus;

describe("guide progress", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuideProgress(), 401);
		await expectStatus(saveGuideProgress({ guideId: "first-upload", status: STARTED }), 401);
		await expectStatus(restartGuide("first-upload"), 401);
	});

	it("is empty for a fresh account: every guide may start", async () => {
		signIn(await f.createUser());
		expect(await getGuideProgress()).toEqual({});
	});

	it("keeps step and context of a started guide, and adds to the context", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({
			guideId: "first-upload",
			status: STARTED,
			step: "create-timeline",
			context: { projectId: "p1" },
		});
		await saveGuideProgress({
			guideId: "first-upload",
			status: STARTED,
			step: "upload-export",
			context: { projectId: "p1", timelineId: "t1" },
		});
		expect(await getGuideProgress()).toEqual({
			"first-upload": {
				status: STARTED,
				step: "upload-export",
				context: { projectId: "p1", timelineId: "t1" },
			},
		});
	});

	it("keeps the context when a step is saved without one", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({ guideId: "first-upload", status: STARTED, context: { a: "1" } });
		await saveGuideProgress({ guideId: "first-upload", status: STARTED, step: "processing" });
		expect((await getGuideProgress())["first-upload"]?.context).toEqual({ a: "1" });
	});

	it("forgets step and context once completed or skipped", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({
			guideId: "first-upload",
			status: STARTED,
			step: "processing",
			context: { exportId: "e1" },
		});
		await saveGuideProgress({ guideId: "first-upload", status: COMPLETED });
		await saveGuideProgress({ guideId: "share-link", status: SKIPPED, step: "copy" });
		expect(await getGuideProgress()).toEqual({
			"first-upload": { status: COMPLETED, step: null, context: null },
			"share-link": { status: SKIPPED, step: null, context: null },
		});
	});

	it("only reads and writes the signed-in user's own progress", async () => {
		const me = await f.createUser();
		const someone = await f.createUser();
		signIn(someone);
		await saveGuideProgress({ guideId: "share-link", status: COMPLETED });
		signIn(me);
		expect(await getGuideProgress()).toEqual({});
		await restartGuide("share-link");
		expect(
			await prisma.guideProgress.count({ where: { userId: someone.id, guideId: "share-link" } }),
		).toBe(1);
	});

	it("restarting forgets the guide, so it starts on its own again", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({ guideId: "first-upload", status: COMPLETED });
		await saveGuideProgress({ guideId: "share-link", status: COMPLETED });
		await restartGuide("first-upload");
		expect(Object.keys(await getGuideProgress())).toEqual(["share-link"]);
	});

	it("rejects unknown guides and statuses", async () => {
		signIn(await f.createUser());
		await expectStatus(
			// @ts-expect-error not a guide
			saveGuideProgress({ guideId: "nope", status: STARTED }),
			400,
		);
		await expectStatus(
			// @ts-expect-error not a status
			saveGuideProgress({ guideId: "first-upload", status: "DONE" }),
			400,
		);
	});
});

describe("guides on and off", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuidesEnabled(), 401);
		await expectStatus(setGuidesEnabled(false), 401);
	});

	it("is on for a fresh account, and stays as the user switched it", async () => {
		const me = await f.createUser();
		signIn(me);
		expect(await getGuidesEnabled()).toBe(true);
		await setGuidesEnabled(false);
		expect(await getGuidesEnabled()).toBe(false);
		await setGuidesEnabled(true);
		expect(await getGuidesEnabled()).toBe(true);
	});

	it("only switches the signed-in user's guides", async () => {
		const me = await f.createUser();
		const someone = await f.createUser();
		signIn(me);
		await setGuidesEnabled(false);
		signIn(someone);
		expect(await getGuidesEnabled()).toBe(true);
	});

	it("keeps the progress when switched off", async () => {
		signIn(await f.createUser());
		await saveGuideProgress({ guideId: "share-link", status: STARTED, step: "panels" });
		await setGuidesEnabled(false);
		expect((await getGuideProgress())["share-link"]?.status).toBe(STARTED);
	});

	it("rejects anything but a boolean", async () => {
		signIn(await f.createUser());
		// @ts-expect-error not a boolean
		await expectStatus(setGuidesEnabled("off"), 400);
	});
});

describe("guide availability", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuideAvailability(), 401);
	});

	it("has no navigation tour without an organization", async () => {
		signIn(await f.createUser());
		expect((await getGuideAvailability()).navigation).toBe(false);
	});

	it("has the navigation tour once there is an export to walk to", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, Role.OWNER);
		signIn(me.user, org.id);
		expect((await getGuideAvailability()).navigation).toBe(false);
		const timeline = await f.createTimeline(await f.createProject(org, { creator: me.user }));
		expect((await getGuideAvailability()).navigation).toBe(false);
		await f.createExport(timeline);
		expect((await getGuideAvailability()).navigation).toBe(true);
	});

	it("only counts exports the member may open", async () => {
		const org = await f.createOrg();
		const owner = await f.createMember(org, Role.OWNER);
		await f.createExport(
			await f.createTimeline(await f.createProject(org, { creator: owner.user })),
		);
		const reviewer = await f.createMember(org, Role.REVIEWER);
		signIn(reviewer.user, org.id);
		expect((await getGuideAvailability()).navigation).toBe(false);
	});
});

describe("guide start", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getGuideStart("share-link"), 401);
	});

	it("sends the share links tour to the latest export the member may share", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, Role.OWNER);
		signIn(me.user, org.id);
		expect(await getGuideStart("share-link")).toBeNull();
		const timeline = await f.createTimeline(await f.createProject(org, { creator: me.user }));
		const exp = await f.createExport(timeline);
		expect(await getGuideStart("share-link")).toBe(
			`/projects/${timeline.projectId}/timelines/${timeline.id}/exports/${exp.id}`,
		);
	});

	it("has no start for exports the member can't reach", async () => {
		const org = await f.createOrg();
		const owner = await f.createMember(org, Role.OWNER);
		await f.createExport(
			await f.createTimeline(await f.createProject(org, { creator: owner.user })),
		);
		const reviewer = await f.createMember(org, Role.REVIEWER);
		signIn(reviewer.user, org.id);
		expect(await getGuideStart("share-link")).toBeNull();
	});

	it("sends first-review to the latest export the member may leave markers on", async () => {
		const org = await f.createOrg();
		const owner = await f.createMember(org, Role.OWNER);
		const timeline = await f.createTimeline(await f.createProject(org, { creator: owner.user }));
		const exp = await f.createExport(timeline);
		// a reviewer of the whole org reaches nothing without a grant; the owner reaches all
		signIn(owner.user, org.id);
		expect(await getGuideStart("first-review")).toBe(
			`/projects/${timeline.projectId}/timelines/${timeline.id}/exports/${exp.id}`,
		);
		const reviewer = await f.createMember(org, Role.REVIEWER);
		signIn(reviewer.user, org.id);
		expect(await getGuideStart("first-review")).toBeNull();
	});

	it("sends invite-team to the members settings, for admins and owners only", async () => {
		const org = await f.createOrg();
		const admin = await f.createMember(org, Role.ADMIN);
		signIn(admin.user, org.id);
		expect(await getGuideStart("invite-team")).toBe(`/organizations/${org.slug}/settings/members`);
		const member = await f.createMember(org, Role.MEMBER);
		signIn(member.user, org.id);
		expect(await getGuideStart("invite-team")).toBeNull();
	});

	it("sends project-access to the latest project the member may give access to", async () => {
		const org = await f.createOrg();
		const owner = await f.createMember(org, Role.OWNER);
		const granted = await f.createProject(org, { creator: owner.user });
		await f.createProject(org, { creator: owner.user }); // newer, but no grant for the member
		const member = await f.createMember(org, Role.MEMBER);
		signIn(member.user, org.id);
		expect(await getGuideStart("project-access")).toBeNull();
		await f.grant(member, { projectId: granted.id });
		expect(await getGuideStart("project-access")).toBe(`/projects/${granted.id}`);
		// a reviewer can't give access, even with a grant
		const reviewer = await f.createMember(org, Role.REVIEWER);
		await f.grant(reviewer, { projectId: granted.id });
		signIn(reviewer.user, org.id);
		expect(await getGuideStart("project-access")).toBeNull();
	});

	it("only looks something up for guides that need it", async () => {
		signIn(await f.createUser());
		expect(await getGuideStart("navigation")).toBeNull();
	});
});

describe("plugin sign-in", () => {
	const CLIENT = "io.postpin.plugin.resolve";
	const session = (
		userId: string,
		data: { clientId?: string; createdAt?: Date; expiresAt?: Date },
	) =>
		prisma.session.create({
			data: {
				id: randomUUID(),
				token: randomUUID(),
				userId,
				expiresAt: data.expiresAt ?? new Date(Date.now() + 60_000),
				createdAt: data.createdAt,
				clientId: data.clientId,
			},
		});

	it("401 without a session", async () => {
		signOut();
		await expectStatus(getPluginSignIn(CLIENT), 401);
	});

	it("is the latest valid sign-in of that plugin, for this user only", async () => {
		const me = await f.createUser();
		const other = await f.createUser();
		signIn(me);
		expect(await getPluginSignIn(CLIENT)).toBeNull();

		await session(me.id, {}); // the browser
		await session(me.id, { clientId: "io.postpin.desktop" });
		await session(other.id, { clientId: CLIENT });
		await session(me.id, { clientId: CLIENT, expiresAt: new Date(Date.now() - 1000) });
		expect(await getPluginSignIn(CLIENT)).toBeNull();

		const older = new Date("2026-01-01T00:00:00Z");
		const newer = new Date("2026-02-01T00:00:00Z");
		await session(me.id, { clientId: CLIENT, createdAt: older });
		await session(me.id, { clientId: CLIENT, createdAt: newer });
		expect(await getPluginSignIn(CLIENT)).toBe(newer.toISOString());
	});
});

describe("plugin tutorial", () => {
	const markerSet = (
		data: { userId: string; timelineId: string; exportId: string } & {
			action: "PUSH" | "PULL";
			hostName?: string;
			summary: object;
		},
	) =>
		prisma.markerSet.create({
			data: {
				action: data.action,
				timelineId: data.timelineId,
				exportId: data.exportId,
				nleTimelineId: "nle-1",
				hostName: data.hostName ?? "Resolve",
				createdById: data.userId,
				summary: data.summary,
				nleMarkers: [],
			},
		});

	async function setup(role: Role = Role.MEMBER) {
		const org = await f.createOrg();
		const owner = await f.createMember(org, Role.OWNER);
		const project = await f.createProject(org, { creator: owner.user });
		const timeline = await f.createTimeline(project);
		const me = role === Role.OWNER ? owner : await f.createMember(org, role);
		if (role !== Role.OWNER) {
			await prisma.memberGrant.create({
				data: { memberId: me.id, projectId: project.id, createdById: owner.user.id },
			});
		}
		signIn(me.user, org.id);
		return { org, project, timeline, me };
	}

	it("401 without a session", async () => {
		signOut();
		await expectStatus(getPluginTutorial(), 401);
		await expectStatus(getGuideStart("sync-to-nle"), 401);
	});

	it("needs an export with markers: then it starts on the dashboard", async () => {
		const { project, timeline } = await setup(Role.OWNER);
		const empty = await f.createExport(timeline);
		expect(await getGuideStart("sync-to-nle")).toBeNull();
		expect((await getGuideAvailability())["sync-to-nle"]).toBe(false);
		expect((await getPluginTutorial()).export).toBeNull();

		const withMarkers = await f.createExport(timeline, { name: "Cut 3" });
		await f.createMarker(withMarkers, await f.createCategory(project));
		await f.createExport(timeline); // newer, but without markers
		expect(await getGuideStart("sync-to-nle")).toBe("/dashboard");
		expect((await getGuideAvailability())["sync-to-nle"]).toBe(true);
		expect((await getPluginTutorial()).export).toEqual({
			project: project.name,
			timeline: timeline.name,
			name: "Cut 3",
			href: `/projects/${project.id}/timelines/${timeline.id}/exports/${withMarkers.id}`,
		});
		expect(empty.id).not.toBe(withMarkers.id);
	});

	it("has no export for a reviewer: the plugins are for members", async () => {
		const { project, timeline } = await setup(Role.REVIEWER);
		await f.createMarker(await f.createExport(timeline), await f.createCategory(project));
		expect(await getGuideStart("sync-to-nle")).toBeNull();
		expect((await getPluginTutorial()).export).toBeNull();
	});

	it("knows the program from the latest sync, before that from the plugin signed in", async () => {
		const { timeline, me } = await setup(Role.OWNER);
		const exp = await f.createExport(timeline);
		expect(await getPluginTutorial()).toMatchObject({ connected: false, program: null });

		await prisma.session.create({
			data: {
				id: randomUUID(),
				token: randomUUID(),
				userId: me.user.id,
				clientId: "io.postpin.desktop",
				expiresAt: new Date(Date.now() + 60_000),
			},
		});
		expect(await getPluginTutorial()).toMatchObject({ connected: true, program: "Pro Tools" });

		await markerSet({
			userId: me.user.id,
			timelineId: timeline.id,
			exportId: exp.id,
			action: "PULL",
			hostName: "Premiere Pro",
			summary: { nle: { added: 1, updated: 0, removed: 0 } },
		});
		expect((await getPluginTutorial()).program).toBe("Premiere Pro");
	});

	it("reports the latest pull, and the latest push that brought a marker", async () => {
		const { timeline, me } = await setup(Role.OWNER);
		const exp = await f.createExport(timeline);
		const other = await f.createUser();
		const base = { timelineId: timeline.id, exportId: exp.id };

		await markerSet({ ...base, userId: other.id, action: "PULL", summary: {} });
		expect(await getPluginTutorial()).toMatchObject({ pullId: null, push: null });

		const pull = await markerSet({
			...base,
			userId: me.user.id,
			action: "PULL",
			summary: { nle: { added: 2, updated: 0, removed: 0 } },
		});
		const push = await markerSet({
			...base,
			userId: me.user.id,
			action: "PUSH",
			summary: { postpin: { added: 1, updated: 0, removed: 0 } },
		});
		// only linked or deleted: not the marker the tutorial waits for
		await markerSet({
			...base,
			userId: me.user.id,
			action: "PUSH",
			summary: { postpin: { added: 0, updated: 0, removed: 1 } },
		});
		expect(await getPluginTutorial()).toMatchObject({
			pullId: pull.id,
			push: {
				id: push.id,
				href: `/projects/${timeline.projectId}/timelines/${timeline.id}/exports/${exp.id}`,
			},
		});
	});
});
