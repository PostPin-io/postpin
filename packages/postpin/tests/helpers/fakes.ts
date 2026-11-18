import { S3 } from "@aws-sdk/client-s3";
import type { LiveScreening } from "@postpin-io/shared/live";

/**
 * In-memory stand-ins for e-mail, S3 and the job queue. They record every call;
 * tests assert on `fakes.*` and the setup file clears them before each test.
 */

export type SentEmail = { to: string; subject: string; text: string; replyTo?: string };
export type S3Call = { command: string; input: Record<string, unknown> };
export type QueueCall = { queue: string; method: string; args: unknown[] };

type S3Responder = (call: S3Call) => unknown;

export const fakes = {
	emails: [] as SentEmail[],
	s3: [] as S3Call[],
	queue: [] as QueueCall[],
	/** Running screenings by link: what Redis holds in production (screening-store.ts) */
	screenings: new Map<string, LiveScreening>(),
	/** Override per test to return something from S3, e.g. a listObjectsV2 page */
	s3Respond: (() => ({})) as S3Responder,
	/** Override per test for flowProducer.getFlow() */
	getFlow: (() => undefined) as (opts: unknown) => unknown,
	/** TRANSCODE_MODE of the mocked env */
	transcodeMode: "plugin" as "plugin" | "server",
	reset() {
		this.emails.length = 0;
		this.s3.length = 0;
		this.queue.length = 0;
		this.screenings.clear();
		this.s3Respond = () => ({});
		this.getFlow = () => undefined;
		this.transcodeMode = "plugin";
	},
};

export const fakeEmailModule = {
	sendEmail: async (
		to: string,
		subject: string,
		text: string,
		options: { replyTo?: string } = {},
	) => {
		// replyTo only when set, so the existing tests' toEqual(...) still match
		fakes.emails.push({ to, subject, text, ...(options.replyTo && { replyTo: options.replyTo }) });
		return { messageId: `fake-${fakes.emails.length}` };
	},
};

/** screening-store.ts without Redis; nothing expires by itself */
export const fakeScreeningStoreModule = {
	SCREENING_LIVE_TTL_SECONDS: 20,
	screeningStore: {
		get: async (linkId: string) => fakes.screenings.get(linkId) ?? null,
		set: async (linkId: string, state: LiveScreening) => void fakes.screenings.set(linkId, state),
		delete: async (linkId: string) => void fakes.screenings.delete(linkId),
	},
};

/** A real S3 client (so presigning works offline) whose `send` never hits the network */
export function fakeS3Client() {
	const client = new S3({
		endpoint: "http://fake-s3.test",
		region: "eu-west-1",
		forcePathStyle: true,
		credentials: { accessKeyId: "test", secretAccessKey: "test" },
	});
	client.send = (async (command: {
		constructor: { name: string };
		input: Record<string, unknown>;
	}) => {
		const call = { command: command.constructor.name, input: command.input };
		fakes.s3.push(call);
		return fakes.s3Respond(call);
	}) as never;
	return client;
}

function fakeQueue(name: string) {
	const record =
		(method: string) =>
		async (...args: unknown[]) => {
			fakes.queue.push({ queue: name, method, args });
			return { id: `job-${fakes.queue.length}`, name: args[0] };
		};
	return {
		name,
		add: record("add"),
		addBulk: record("addBulk"),
		getJobCounts: async () => ({}),
		close: async () => {},
	};
}

export function fakeFlowProducer() {
	return {
		add: async (flow: unknown) => {
			fakes.queue.push({ queue: "flow", method: "add", args: [flow] });
			return { job: { id: "flow-job" } };
		},
		getFlow: async (opts: unknown) => fakes.getFlow(opts),
		close: async () => {},
	};
}

export const fakeGetQueue = (name: string) => fakeQueue(name);
