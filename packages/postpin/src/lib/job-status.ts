import type { JobState } from "bullmq";
import ChevronsUp from "@lucide/svelte/icons/chevrons-up";
import CircleCheck from "@lucide/svelte/icons/circle-check";
import CircleQuestionMark from "@lucide/svelte/icons/circle-question-mark";
import CircleX from "@lucide/svelte/icons/circle-x";
import Clock from "@lucide/svelte/icons/clock";
import Hourglass from "@lucide/svelte/icons/hourglass";
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
/** One job of a media's processing flow, as `getProcessingJobs` returns it */
export type ProcessingJob = {
	id?: string;
	label: string;
	state: JobState | "unknown";
	progress: number;
	failedReason?: string;
	weight: number;
};

/** Still queued or working; "unknown" (the job is gone) counts as finished so polling can stop */
export function isJobRunning(job: Pick<ProcessingJob, "state">): boolean {
	return job.state !== "completed" && job.state !== "failed" && job.state !== "unknown";
}

/** Weighted progress of all jobs, 0–100 */
export function totalJobProgress(jobs: ProcessingJob[]): number {
	const totalWeight = jobs.reduce((sum, job) => sum + job.weight, 0);
	if (totalWeight === 0) return 100;
	const done = jobs.reduce((sum, job) => {
		const share =
			job.state === "active" || job.state === "waiting"
				? (job.progress ?? 0.5)
				: job.state === "completed"
					? 1
					: 0;
		return sum + share * job.weight;
	}, 0);
	return (done / totalWeight) * 100;
}
