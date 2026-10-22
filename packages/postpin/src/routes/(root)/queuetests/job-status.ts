import type { JobState } from "bullmq";
import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
import CircleCheck from "@lucide/svelte/icons/circle-check";
import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
import CircleX from "@lucide/svelte/icons/circle-x";
import Clock from "@lucide/svelte/icons/clock";
import Hourglass from "@lucide/svelte/icons/hourglass";
import ListTree from "@lucide/svelte/icons/list-tree";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import type { Component } from "svelte";

export const jobStateBadges: Record<
	JobState | "unknown",
	{ badge: string; color: string; text: string; icon: Component }
> = {
	active: { badge: "badge-primary", color: "text-primary", text: "Active", icon: LoaderCircle },
	completed: {
		badge: "badge-success",
		color: "text-success",
		text: "Completed",
		icon: CircleCheck,
	},
	failed: { badge: "badge-error", color: "text-error", text: "Failed", icon: CircleX },
	delayed: { badge: "badge-warning", color: "text-warning", text: "Delayed", icon: Clock },
	"waiting-children": {
		badge: "badge-info",
		color: "text-info",
		text: "Waiting Children",
		icon: Hourglass,
	},
	waiting: { badge: "badge-info", color: "text-info", text: "Waiting", icon: Hourglass },
	prioritized: { badge: "badge-info", color: "text-info", text: "Prioritized", icon: ChevronsUp },
	unknown: {
		badge: "badge-ghost",
		color: "text-base-content/50",
		text: "Unknown",
		icon: CircleQuestionMark,
	},
};
