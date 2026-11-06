import { getQueue, Queues } from "@postpin-io/shared/queue";
import * as env from "$app/env/private";
import { command, query } from "$app/server";
import * as v from "valibot";
import { requireSystemAdmin } from "#lib/server/system-admin.ts";
import { error } from "@sveltejs/kit";
import { prisma } from "#lib/server/database.ts";
import { s3Client } from "#lib/server/storage.ts";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sendEmail } from "#lib/server/email.ts";
import { version } from "$app/env";

const heavyQueue = getQueue(Queues.heavy, env);
const lightQueue = getQueue(Queues.light, env);

function withTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`Timeout after ${ms} ms`)), ms),
		),
	]);
}

const JOB_STATES = [
	"active",
	"waiting",
	"delayed",
	"failed",
	"completed",
	"prioritized",
	"waiting-children",
] as const;

export const getJobs = query(
	v.object({ state: v.optional(v.picklist(JOB_STATES)), limit: v.optional(v.number(), 50) }),
	async ({ state, limit }) => {
		requireSystemAdmin();
		const types = state ? [state] : [...JOB_STATES];
		const [heavy, light] = await withTimeout(
			Promise.all([
				heavyQueue.getJobs(types, 0, limit - 1),
				lightQueue.getJobs(types, 0, limit - 1),
			]),
		);
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
		)
			.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
			.slice(0, limit);
	},
);

const JobRef = v.object({ queue: v.picklist(["heavy", "light"]), id: v.string() });
const queues = { heavy: heavyQueue, light: lightQueue };

export const retryJob = command(JobRef, async ({ queue, id }) => {
	requireSystemAdmin();
	const job = await queues[queue].getJob(id);
	if (!job) error(404, "Job not found");
	if ((await job.getState()) !== "failed") error(400, "Only failed jobs can be retried");
	await job.retry();
	await getQueueOverview().refresh();
});
export const removeJob = command(JobRef, async ({ queue, id }) => {
	requireSystemAdmin();
	const job = await queues[queue].getJob(id);
	if (!job) error(404, "Job not found");
	if ((await job.getState()) == "active") error(400, "Cannot remove active jobs");
	await job.remove();
	await getQueueOverview().refresh();
});

export const getQueueOverview = query(async () => {
	requireSystemAdmin();
	return withTimeout(
		Promise.all(
			(
				[
					["heavy", heavyQueue],
					["light", lightQueue],
				] as const
			).map(async ([name, q]) => ({
				name,
				counts: await q.getJobCounts("active", "waiting", "delayed", "failed", "completed"),
				workers: (await q.getWorkers()).length,
				paused: await q.isPaused(),
			})),
		),
	);
});

export const getHealth = query(async () => {
	requireSystemAdmin();
	const check = async (fn: () => Promise<unknown>) => {
		const started = Date.now();
		try {
			await withTimeout(fn());
			return { ok: true as const, ms: Date.now() - started };
		} catch (e) {
			return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
		}
	};
	const [database, storage, redis] = await Promise.all([
		check(() => prisma.$queryRaw`SELECT 1`),
		check(() => s3Client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))),
		check(() => heavyQueue.getJobCounts("waiting")),
	]);
	return {
		database,
		storage,
		redis,
		smtp: { configured: !!env.SMTP_HOST },
		version,
	};
});

export const sendTestEmail = command(async () => {
	const user = requireSystemAdmin();
	await sendEmail(user.email, "PostPin test email", "SMTP works.");
});
