import { S3 } from "@aws-sdk/client-s3";

/**
 * In-memory stand-ins for e-mail, S3 and the job queue. They record every call;
 * tests assert on `fakes.*` and the setup file clears them before each test.
 */

export type SentEmail = { to: string; subject: string; text: string };
export type S3Call = { command: string; input: Record<string, unknown> };
export type QueueCall = { queue: string; method: string; args: unknown[] };

type S3Responder = (call: S3Call) => unknown;

export const fakes = {
	emails: [] as SentEmail[],
	s3: [] as S3Call[],
	queue: [] as QueueCall[],
	/** Override per test to return something from S3, e.g. a listObjectsV2 page */
	s3Respond: (() => ({})) as S3Responder,
	/** Override per test for flowProducer.getFlow() */
	getFlow: (() => undefined) as (opts: unknown) => unknown,
	reset() {
		this.emails.length = 0;
		this.s3.length = 0;
		this.queue.length = 0;
		this.s3Respond = () => ({});
		this.getFlow = () => undefined;
	},
};

export const fakeEmailModule = {
	sendEmail: async (to: string, subject: string, text: string) => {
		fakes.emails.push({ to, subject, text });
		return { messageId: `fake-${fakes.emails.length}` };
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
