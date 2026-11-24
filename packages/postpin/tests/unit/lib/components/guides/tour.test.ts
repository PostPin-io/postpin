import { afterEach, describe, expect, it, vi } from "vitest";
import {
	GUIDE_BUTTON_TOKEN,
	fallbackStep,
	nextShownStep,
	placeCard,
	STEP_ICONS,
	icon,
	key,
	keyLabel,
	splitStepText,
	stepKind,
	visibleRect,
	type TourStep,
} from "#lib/components/guides/tour.ts";
import { signalGuide } from "#lib/components/guides/guide-signals.svelte.ts";
import { shareLinkTour } from "#lib/components/guides/tours/share-link.ts";
import { GUIDES, GUIDE_IDS, lowestRoleWith, roleCanDo } from "#lib/guides.ts";
import { Role } from "@postpin-io/shared/db/enums";
import { postpinGuidesTour } from "#lib/components/guides/tours/postpin-guides.ts";
import { navigationTour } from "#lib/components/guides/tours/navigation.ts";
import { firstReviewTour } from "#lib/components/guides/tutorials/first-review.ts";
import { markerRangesTour } from "#lib/components/guides/tours/marker-ranges.ts";
import { inviteTeamTour } from "#lib/components/guides/tours/invite-team.ts";
import { projectAccessTour } from "#lib/components/guides/tours/project-access.ts";

const viewport = { width: 1000, height: 800 };
const card = { width: 300, height: 200 };

describe("placeCard", () => {
	it("goes below the element, centered on it", () => {
		expect(placeCard({ top: 100, bottom: 140, left: 400, width: 200 }, card, viewport)).toEqual({
			top: 152,
			left: 350,
		});
	});

	it("goes above when there is no room below", () => {
		expect(placeCard({ top: 600, bottom: 640, left: 400, width: 200 }, card, viewport).top).toBe(
			388,
		);
	});

	it("stays on screen at the edges", () => {
		expect(placeCard({ top: 100, bottom: 140, left: 0, width: 20 }, card, viewport).left).toBe(8);
		expect(placeCard({ top: 100, bottom: 140, left: 990, width: 10 }, card, viewport).left).toBe(
			692,
		);
	});

	it("is pushed into view when it fits neither below nor above", () => {
		const tall = { width: 300, height: 700 };
		expect(placeCard({ top: 300, bottom: 340, left: 400, width: 200 }, tall, viewport).top).toBe(
			92,
		);
	});
});

describe("fallbackStep", () => {
	it("is the latest earlier step whose element is there", () => {
		expect(fallbackStep(4, (i) => i === 0 || i === 1)).toBe(1);
	});

	it("is none when no earlier element is there", () => {
		expect(fallbackStep(3, () => false)).toBeNull();
		expect(fallbackStep(0, () => true)).toBeNull();
	});
});

const TOURS = [
	shareLinkTour,
	postpinGuidesTour,
	navigationTour,
	markerRangesTour,
	inviteTeamTour,
	projectAccessTour,
];

describe.each(TOURS.map((t) => [t.guideId, t] as const))("%s tour", (_, tour) => {
	it("is a known tour with unique step ids", () => {
		expect(GUIDES.find((g) => g.id === tour.guideId)?.type).toBe("tour");
		const ids = tour.steps.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("ends with exactly one completion card, as its last step", () => {
		const done = tour.steps.filter((s) => s.advance === "done");
		expect(done).toHaveLength(1);
		expect(tour.steps.at(-1)).toBe(done[0]);
	});

	it("never goes on by itself into the completion card", () => {
		// "appears" waits for the next step's element; the completion card has none
		expect(tour.steps.at(-2)!.advance).not.toBe("appears");
	});

	it("never asks for a click on a step that is only looked at (rule 16)", () => {
		// a Look text describes; asking to do something belongs on a Your-turn step
		const asks = /^(click|open|create|add|go|switch|filter|find|start|drop|save|copy)\b/i;
		for (const step of tour.steps.filter((s) => stepKind(s) === "look")) {
			for (const sentence of step.text.split(/(?<=\.)\s+/)) {
				expect(sentence, step.id).not.toMatch(asks);
			}
		}
	});
});

describe("first-review tutorial", () => {
	it("is a tutorial run by the tour engine, with unique step ids and one completion card", () => {
		expect(GUIDES.find((g) => g.id === firstReviewTour.guideId)?.type).toBe("tutorial");
		const ids = firstReviewTour.steps.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(firstReviewTour.steps.filter((s) => s.advance === "done")).toHaveLength(1);
		expect(firstReviewTour.steps.at(-1)!.advance).toBe("done");
	});

	it("only goes on once the user did each step, never by Next", () => {
		// a tutorial: the user does it, the guide reacts (docs/guides/README.md)
		for (const step of firstReviewTour.steps.slice(0, -1)) {
			expect(["signal", "click"], step.id).toContain(step.advance);
		}
	});

	it("goes play/pause, marker, title, category, jump, then the conversation", () => {
		expect(firstReviewTour.steps.map((s) => s.id)).toEqual([
			"play",
			"add-marker",
			"title",
			"category",
			"jump",
			"expand",
			"open-responses",
			"reply",
			"done",
		]);
	});

	it("lets only the shortcut of the step's own action through", () => {
		const keys = (id: string) => firstReviewTour.steps.find((s) => s.id === id)!.keys ?? [];
		expect(keys("play")).toContain(" ");
		expect(keys("play")).not.toContain("m");
		expect(keys("play")).not.toContain("k");
		expect(keys("add-marker")).toEqual(["m", "M"]);
		for (const step of firstReviewTour.steps) expect(step.keys ?? []).not.toContain("Escape");
	});
});

describe("stepKind", () => {
	it("tells looking, trying and acting apart", () => {
		expect(stepKind({ advance: "next", inert: true })).toBe("look");
		expect(stepKind({ advance: "next", centered: true })).toBe("look");
		expect(stepKind({ advance: "next" })).toBe("try");
		expect(stepKind({ advance: "click" })).toBe("act");
		expect(stepKind({ advance: "appears" })).toBe("act");
		expect(stepKind({ advance: "signal" })).toBe("act");
		expect(stepKind({ advance: "done" })).toBe("done");
	});
});

describe("guide roles (rule 17)", () => {
	const byId = (id: string) => GUIDES.find((g) => g.id === id)!;

	it.each(GUIDES.filter((g) => "permission" in g).map((g) => [g.id, g] as const))(
		"%s: its lowest role is the lowest one with its right",
		(_, guide) => {
			expect(lowestRoleWith(guide.permission!)).toBe(guide.minRole);
		},
	);

	it("lets only Member and up do what has an upload or sharing in it", () => {
		for (const id of ["first-upload", "share-link"]) {
			expect(roleCanDo(byId(id), Role.REVIEWER), id).toBe(false);
			expect(roleCanDo(byId(id), Role.MEMBER), id).toBe(true);
		}
		expect(roleCanDo(byId("first-review"), Role.REVIEWER)).toBe(true);
	});

	it("keeps the plugins, and so their install tutorials, from reviewers", () => {
		for (const id of ["install-resolve", "install-premiere", "install-desktop", "sync-to-nle"]) {
			expect(roleCanDo(byId(id), Role.REVIEWER), id).toBe(false);
			expect(roleCanDo(byId(id), Role.MEMBER), id).toBe(true);
		}
	});

	it("without an organization: what everyone can do, and what creates the organization", () => {
		expect(roleCanDo(byId("first-upload"), null)).toBe(true);
		expect(roleCanDo(byId("postpin-guides"), null)).toBe(true);
		expect(roleCanDo(byId("share-link"), null)).toBe(false);
	});
});

describe("guide registry", () => {
	it("starts tutorials and the tour about guides on their own, all other tours by hand", () => {
		for (const guide of GUIDES) {
			const automatic = guide.type === "tutorial" || guide.id === "postpin-guides";
			expect(guide.trigger, guide.id).toBe(automatic ? "automatic" : "manual");
		}
	});

	it("has a guide id for every tour definition", () => {
		for (const tour of TOURS) expect(GUIDE_IDS).toContain(tour.guideId);
	});
});

describe("nextShownStep", () => {
	const step = (id: string, skip = false): TourStep => ({
		id,
		title: id,
		text: "",
		advance: "next",
		skipIf: () => skip,
	});

	it("is the step itself when it isn't left out", () => {
		expect(nextShownStep([step("a"), step("b")], 1)).toBe(1);
	});

	it("goes past steps that are left out", () => {
		expect(nextShownStep([step("a"), step("b", true), step("c", true), step("d")], 1)).toBe(3);
	});

	it("is null at the end", () => {
		expect(nextShownStep([step("a"), step("b", true)], 1)).toBeNull();
		expect(nextShownStep([step("a")], 1)).toBeNull();
	});
});

describe("splitStepText", () => {
	it("splits around every guide button", () => {
		expect(splitStepText(`look for ${GUIDE_BUTTON_TOKEN} next to it`)).toEqual([
			"look for ",
			{ icon: "guide-button" },
			" next to it",
		]);
		expect(splitStepText("no icon")).toEqual(["no icon"]);
	});

	it("splits around lucide icons, also several and at the edges", () => {
		expect(splitStepText(`${icon("play")} then ${icon("pause")}`)).toEqual([
			{ icon: "play" },
			" then ",
			{ icon: "pause" },
		]);
	});

	it("splits around keys, shown as key caps", () => {
		expect(splitStepText(`Press ${key("M")} or ${key("⌥")}`)).toEqual([
			"Press ",
			{ key: "M" },
			" or ",
			{ key: "⌥" },
		]);
	});

	it("keeps an unknown icon as text, so a typo shows", () => {
		expect(splitStepText("press {icon:nope}")).toEqual(["press {icon:nope}"]);
	});

	it("only knows icons that are drawn", async () => {
		const { STEP_ICON_COMPONENTS } = await import("#lib/components/guides/step-icons.ts");
		expect(Object.keys(STEP_ICON_COMPONENTS).sort()).toEqual([...STEP_ICONS].sort());
	});
});

describe("postpin-guides tour", () => {
	const byId = (id: string) => postpinGuidesTour.steps.find((s) => s.id === id)!;

	it("starts with a centered welcome card", () => {
		const first = postpinGuidesTour.steps[0]!;
		expect(first.id).toBe("welcome");
		expect(first.centered).toBe(true);
		expect(first.advance).toBe("next");
	});

	it("only explains the PostPin Guides page, so nothing there starts another guide", () => {
		for (const id of ["tutorials", "tours", "start", "filter", "switch"]) {
			expect(byId(id).inert, id).toBe(true);
		}
	});

	it("shows the guide button in the explanation of tours", () => {
		expect(byId("tours").text).toContain(GUIDE_BUTTON_TOKEN);
	});
});
describe("navigation tour", () => {
	const byId = (id: string) => navigationTour.steps.find((s) => s.id === id)!;

	it("leads through several pages, so leaving a page doesn't pause it", () => {
		expect(navigationTour.spansPages).toBe(true);
	});

	it("only the open steps are clicked, everything explained is inert", () => {
		for (const step of navigationTour.steps) {
			if (step.advance === "done") continue;
			const acts = step.id === "go-home" || step.id.startsWith("open-");
			expect(step.advance === "click", step.id).toBe(acts);
			expect(!!step.inert, step.id).toBe(!acts);
		}
	});

	it("waits for the page after every step that navigates", () => {
		const ids = navigationTour.steps.map((s) => s.id);
		for (const open of ["open-project", "open-timeline", "open-export"]) {
			expect(navigationTour.steps[ids.indexOf(open) + 1]!.waitForElement, open).toBe(true);
		}
	});

	it("shows exactly one breadcrumb variant per screen size", () => {
		const desktop = byId("breadcrumbs").skipIf!;
		const phone = byId("back").skipIf!;
		for (const matches of [true, false]) {
			vi.stubGlobal("window", { matchMedia: () => ({ matches }) });
			expect(desktop() !== phone()).toBe(true);
		}
		vi.unstubAllGlobals();
	});
});

describe("marker-ranges tour", () => {
	const byId = (id: string) => markerRangesTour.steps.find((s) => s.id === id)!;

	/** A page on which only these steps' elements are there (`data-guide="marker-ranges/<id>"`) */
	function pageWith(...present: string[]) {
		const element = { getBoundingClientRect: () => ({ width: 10, height: 10 }) };
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) =>
				present.some((id) => selector.includes(`"marker-ranges/${id}"`)) ? [element] : [],
		});
	}
	afterEach(() => vi.unstubAllGlobals());

	it("needs the timeline, so only runs on wide screens", () => {
		expect(markerRangesTour.desktopOnly).toBe(true);
	});

	it("adds a marker first and shapes only that one, which a reviewer may change (rule 17)", () => {
		expect(markerRangesTour.steps[0]!.id).toBe("add-marker");
		expect(GUIDES.find((g) => g.id === "marker-ranges")?.minRole).toBe(Role.REVIEWER);
	});

	it("goes through the steps of its guide file, in order", () => {
		expect(markerRangesTour.steps.map((s) => s.id)).toEqual([
			"add-marker",
			"show-timeline",
			"move",
			"make-range",
			"end",
			"expand",
			"timecode",
			"range-end",
			"keys",
			"done",
		]);
	});

	it("waits for the real drag, typing and click on the steps that do something", () => {
		for (const id of ["add-marker", "move", "end", "timecode"]) {
			expect(byId(id).advance, id).toBe("signal");
		}
		expect(byId("make-range").advance).toBe("click");
		expect(byId("expand").advance).toBe("click");
	});

	it("leaves steps out by the marker's state, never because an element is missing a moment", () => {
		// optional + a missing element skipped the step, the next one went back: a loop
		for (const step of markerRangesTour.steps) expect(step.optional, step.id).toBeFalsy();
		for (const id of ["show-timeline", "make-range", "end", "expand", "range-end"]) {
			expect(byId(id).skipIf, id).toBeTypeOf("function");
		}
	});

	it("waits for elements on their way instead of going back to the timeline", () => {
		for (const id of ["add-marker", "move", "make-range", "expand", "timecode"]) {
			expect(byId(id).waitForElement, id).toBe(true);
		}
	});

	it("asks to make a range only of a point marker", () => {
		pageWith("move");
		expect(byId("make-range").skipIf!()).toBe(false);
		// its end triangle is on the timeline: a range already
		pageWith("move", "end");
		expect(byId("make-range").skipIf!()).toBe(true);
	});

	it("asks to open the marker only while it is closed", () => {
		pageWith("expand");
		expect(byId("expand").skipIf!()).toBe(false);
		pageWith("timecode");
		expect(byId("expand").skipIf!()).toBe(true);
		// filtered out of the list: not left out, the step waits for it
		pageWith();
		expect(byId("expand").skipIf!()).toBe(false);
	});

	it("shows the start/end switch only for a range", () => {
		pageWith("range-end");
		expect(byId("range-end").skipIf!()).toBe(false);
		pageWith("timecode");
		expect(byId("range-end").skipIf!()).toBe(true);
	});

	it("doesn't ask for the end again after an ⌥-drag that set it", () => {
		signalGuide("marker-ranges", "end");
		signalGuide("marker-ranges", "add-marker");
		// a new marker: its end wasn't dragged yet
		expect(byId("end").skipIf!()).toBe(false);
		signalGuide("marker-ranges", "end");
		expect(byId("end").skipIf!()).toBe(true);
	});

	it("only offers on a step what can be done on it", () => {
		// the timeline is blocked while the editor's button is highlighted: no ⌥-drag there
		expect(
			splitStepText(byId("make-range").text).some((p) => typeof p !== "string" && "key" in p),
		).toBe(false);
	});

	it("lets the in and out keys through only where it explains them", () => {
		expect(byId("keys").keys).toEqual(expect.arrayContaining([" ", "i", "o", "m"]));
		for (const step of markerRangesTour.steps) {
			if (step.id !== "keys") expect(step.keys ?? [], step.id).not.toContain("i");
			expect(step.keys ?? [], step.id).not.toContain("Escape");
		}
	});
});

describe("visibleRect", () => {
	const rect = (left: number, top: number, width: number, height: number) => ({
		left,
		top,
		width,
		height,
	});

	it("is the element itself when nothing clips it", () => {
		expect(visibleRect(rect(10, 10, 20, 20), [])).toEqual(rect(10, 10, 20, 20));
	});

	it("cuts a range bar wider than the timeline to the timeline", () => {
		expect(visibleRect(rect(-500, 100, 3000, 8), [rect(200, 0, 800, 600)])).toEqual(
			rect(200, 100, 800, 8),
		);
	});

	it("cuts to every scroll container it is in", () => {
		expect(visibleRect(rect(0, 0, 100, 100), [rect(10, 0, 200, 50), rect(0, 20, 50, 200)])).toEqual(
			rect(10, 20, 40, 30),
		);
	});

	it("is none when the element is scrolled out of view", () => {
		expect(visibleRect(rect(900, 10, 10, 10), [rect(0, 0, 800, 600)])).toBeNull();
	});
});

describe("guide texts on screen (rule 14)", () => {
	it.each([...TOURS, firstReviewTour].map((t) => [t.guideId, t] as const))(
		"%s never says NLE",
		(_, tour) => {
			for (const step of tour.steps) {
				expect(`${step.title} ${step.text}`, step.id).not.toMatch(/\bNLEs?\b/);
			}
		},
	);
});

describe("keys in guide texts (rule 14)", () => {
	it("labels keys as on the keyboard", () => {
		expect(["m", "M", " ", "Alt", "Enter"].map(keyLabel)).toEqual([
			"M",
			"M",
			"Space",
			"⌥",
			"Enter",
		]);
	});

	const ALL = [...TOURS, firstReviewTour];
	it.each(
		ALL.flatMap((t) =>
			t.steps.filter((s) => s.keys).map((s) => [`${t.guideId}/${s.id}`, s] as const),
		),
	)("%s names every key it lets through, as a key", (_, step) => {
		const named = splitStepText(step.text).flatMap((p) =>
			typeof p !== "string" && "key" in p ? [p.key] : [],
		);
		for (const k of step.keys!) expect(named, k).toContain(keyLabel(k));
	});

	it("never writes a key as plain text where it is a key", () => {
		// a bare "or M" or "press Enter" would look different from the key caps elsewhere
		for (const tour of ALL) {
			for (const step of tour.steps) {
				const plain = splitStepText(step.text)
					.filter((p) => typeof p === "string")
					.join("");
				expect(plain, `${tour.guideId}/${step.id}`).not.toMatch(
					/\b(press|with|or) (Enter|Space|[A-Z])\b|⌥/,
				);
			}
		}
	});
});

describe("project-access tour", () => {
	const byId = (id: string) => projectAccessTour.steps.find((s) => s.id === id)!;

	function pageWith(...present: string[]) {
		const element = { getBoundingClientRect: () => ({ width: 10, height: 10 }) };
		vi.stubGlobal("document", {
			querySelectorAll: (selector: string) =>
				present.some((id) => selector.includes(`"project-access/${id}"`)) ? [element] : [],
		});
	}
	afterEach(() => vi.unstubAllGlobals());

	it("goes through the steps of its guide file, in order", () => {
		expect(projectAccessTour.steps.map((s) => s.id)).toEqual([
			"open",
			"add",
			"access-tab",
			"grants",
			"links-tab",
			"invite-link",
			"done",
		]);
	});

	it("opens the dialog first, unless it was started from inside it", () => {
		pageWith("open");
		expect(byId("open").skipIf!()).toBe(false);
		pageWith("add");
		expect(byId("open").skipIf!()).toBe(true);
	});

	it("lets the user switch the tabs themselves", () => {
		expect(byId("access-tab").advance).toBe("click");
		expect(byId("links-tab").advance).toBe("click");
	});
});

describe("invite-team tour", () => {
	it("goes through the steps of its guide file, in order, for admins and up", () => {
		expect(inviteTeamTour.steps.map((s) => s.id)).toEqual(["invite", "roles", "links", "done"]);
		expect(GUIDES.find((g) => g.id === "invite-team")?.minRole).toBe(Role.ADMIN);
	});
});
