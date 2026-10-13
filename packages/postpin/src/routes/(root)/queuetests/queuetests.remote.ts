import { getQueue, Queues } from "@postpin/shared/queue";
import * as env from "$app/env/private";
import { command, query } from "$app/server";

const heavyQueue = getQueue(Queues.heavy, env);
const lightQueue = getQueue(Queues.light, env);

export const getJobs = query(() => {
	return Promise.all([heavyQueue.getJobs(), lightQueue.getJobs()]).then(async ([heavy, light]) => {
		return (
			await Promise.all(
				[
					...heavy.map((job) => ({ job, queue: "heavy" as const })),
					...light.map((job) => ({ job, queue: "light" as const })),
				].map(async ({ job: j, queue }) => ({
					key: `${queue}:${j.id}`,
					id: j.id,
					queue,
					name: j.name,
					state: await j.getState(),
					progress: j.progress as number,
					data: j.data,
					opts: j.opts,
					returnvalue: j.returnvalue,
					failedReason: j.failedReason,
					stacktrace: j.stacktrace,
					deferredFailure: j.deferredFailure,
					delay: j.delay,
					priority: j.priority,
					attemptsStarted: j.attemptsStarted,
					attemptsMade: j.attemptsMade,
					stalledCounter: j.stalledCounter,
					timestamp: j.timestamp,
					processedOn: j.processedOn,
					finishedOn: j.finishedOn,
					processedBy: j.processedBy,
					parentKey: j.parentKey,
					parent: j.parent,
					repeatJobKey: j.repeatJobKey,
					deduplicationId: j.deduplicationId,
				})),
			)
		).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
	});
});

export const clearJobs = command(async () => {
	await Promise.all([
		heavyQueue.obliterate({ force: true }),
		lightQueue.obliterate({ force: true }),
	]);
	await getJobs().refresh();
});
