import { describe, expect, it } from "vitest";
import { Role } from "@postpin-io/shared/db/enums";
import {
	finishTutorial,
	getTutorialState,
	markTutorialStep,
	restartTutorial,
} from "#lib/components/tutorial/tutorial.remote.ts";
import { prisma } from "../../../../helpers/db.ts";
import { expectStatus } from "../../../../helpers/expect.ts";
import * as f from "../../../../helpers/factories.ts";
import { signIn, signOut } from "../../../../helpers/request-event.ts";

const { OWNER, MEMBER, REVIEWER } = Role;

/** A playable export, as the worker leaves it */
async function playableExport(timeline: { id: string }) {
	const exp = await f.createExport(timeline, { media: true });
	await prisma.media.update({ where: { id: exp.mediaId! }, data: { status: "COMPLETED" } });
	return exp;
}

describe("getTutorialState", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(getTutorialState(), 401);
	});

	it("starts a fresh account with its organization", async () => {
		const user = await f.createUser({ name: "Ada Lovelace" });
		signIn(user);
		expect(await getTutorialState()).toMatchObject({
			step: "organization",
			eligible: true,
			firstName: "Ada",
			organization: null,
			project: null,
			timeline: null,
			export: null,
		});
	});

	it("follows what the user makes, up to the review of the first export", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, OWNER);
		signIn(me.user, org.id);
		expect((await getTutorialState()).step).toBe("project");

		const project = await f.createProject(org, { creator: me.user });
		expect(await getTutorialState()).toMatchObject({
			step: "timeline",
			project: { id: project.id },
		});

		const timeline = await f.createTimeline(project);
		expect(await getTutorialState()).toMatchObject({
			step: "upload",
			timeline: { id: timeline.id },
		});

		// uploaded, but not playable yet
		const exp = await f.createExport(timeline, { media: true });
		expect(await getTutorialState()).toMatchObject({
			step: "upload",
			export: { id: exp.id, status: "PENDING" },
		});

		await prisma.media.update({ where: { id: exp.mediaId! }, data: { status: "COMPLETED" } });
		expect(await getTutorialState()).toMatchObject({
			step: "review",
			seen: { markers: false, sharing: false },
		});
	});

	it("is done once both tours on the review page were seen, in any order", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, OWNER);
		await playableExport(await f.createTimeline(await f.createProject(org, { creator: me.user })));
		signIn(me.user, org.id);

		await markTutorialStep("sharing");
		expect(await getTutorialState()).toMatchObject({
			step: "review",
			seen: { markers: false, sharing: true },
		});
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: me.user.id } })).tutorialCompletedAt,
		).toBeNull();

		await markTutorialStep("markers");
		expect((await getTutorialState()).step).toBeNull();
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: me.user.id } })).tutorialCompletedAt,
		).not.toBeNull();
	});

	it("takes the timeline the plugin uploaded to, not the newest one", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, OWNER);
		const project = await f.createProject(org, { creator: me.user });
		const uploaded = await f.createTimeline(project);
		const exp = await playableExport(uploaded);
		await f.createTimeline(project);
		signIn(me.user, org.id);
		expect(await getTutorialState()).toMatchObject({
			timeline: { id: uploaded.id },
			export: { id: exp.id },
		});
	});

	it("only sees the user's own organization and projects", async () => {
		const org = await f.createOrg();
		const me = await f.createMember(org, OWNER);
		// someone else's project in my organization, and a whole other organization
		const colleague = await f.createMember(org, MEMBER);
		await f.createProject(org, { creator: colleague.user });
		const other = await f.createOrg();
		const otherOwner = await f.createMember(other, OWNER);
		await playableExport(
			await f.createTimeline(await f.createProject(other, { creator: otherOwner.user })),
		);

		signIn(me.user, org.id);
		expect(await getTutorialState()).toMatchObject({
			step: "project",
			organization: { id: org.id },
			project: null,
			export: null,
		});
	});

	it.each([MEMBER, REVIEWER])("is not for a %s invited into an organization", async (role) => {
		const org = await f.createOrg();
		const owner = await f.createMember(org, OWNER);
		await playableExport(
			await f.createTimeline(await f.createProject(org, { creator: owner.user })),
		);
		const me = await f.createMember(org, role);
		signIn(me.user, org.id);
		expect(await getTutorialState()).toMatchObject({ step: null, eligible: false });
	});
});

describe("markTutorialStep", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(markTutorialStep("sharing"), 401);
	});

	it("rejects a step it doesn't know", async () => {
		signIn(await f.createUser());
		// @ts-expect-error not one of TUTORIAL_SEEN_STEPS
		await expectStatus(markTutorialStep("everything"), 400);
	});

	it("stores a step once, for the signed-in user only", async () => {
		const me = await f.createUser();
		const someone = await f.createUser();
		signIn(me);
		await markTutorialStep("sharing");
		await markTutorialStep("sharing");
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).tutorialSeenSteps,
		).toEqual(["sharing"]);
		expect(
			(await prisma.user.findUniqueOrThrow({ where: { id: someone.id } })).tutorialSeenSteps,
		).toEqual([]);
	});
});

describe("finishTutorial / restartTutorial", () => {
	it("401 without a session", async () => {
		signOut();
		await expectStatus(finishTutorial(), 401);
		await expectStatus(restartTutorial(), 401);
	});

	it("ends the tutorial and starts it over", async () => {
		const me = await f.createUser();
		signIn(me);
		await markTutorialStep("sharing");
		await finishTutorial();
		expect((await getTutorialState()).step).toBeNull();

		await restartTutorial();
		expect((await getTutorialState()).step).toBe("organization");
		expect(await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).toMatchObject({
			tutorialCompletedAt: null,
			tutorialSeenSteps: [],
		});
	});
});
