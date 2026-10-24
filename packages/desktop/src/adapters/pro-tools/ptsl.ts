import { ClientError, Status, createChannel, createClient } from "nice-grpc";
import * as PTSL from "../../third-party/protools-sdk/dist/PTSL";
import type { DeepPartial, MessageFns, Response } from "../../third-party/protools-sdk/dist/PTSL";

const { CommandId, PTSLDefinition, ResponseError, TaskStatus } = PTSL;

// PTSL API version this client was generated from
const API_VERSION = 2026;
const API_VERSION_MINOR = 4;

// Oldest Pro Tools we support, see docs on GetColorPalette & co
const MIN_VERSION = 2025;
const MIN_VERSION_MINOR = 10;

// Every command CId_<Name> has its bodies generated as <Name>RequestBody and <Name>ResponseBody,
// if it has any. That lets send() take the command name and derive both types from it.
type Messages = typeof PTSL;
export type CommandName = keyof typeof CommandId extends infer K
	? K extends `CId_${infer Name}`
		? Name
		: never
	: never;
type MessageOf<K> = K extends keyof Messages
	? Messages[K] extends MessageFns<infer T>
		? T
		: never
	: never;
export type RequestOf<N extends CommandName> = MessageOf<`${N}RequestBody`>;
export type ResponseOf<N extends CommandName> = [MessageOf<`${N}ResponseBody`>] extends [never]
	? void
	: MessageOf<`${N}ResponseBody`>;
// Commands without a request body take no request argument
type RequestArg<N extends CommandName> = [RequestOf<N>] extends [never]
	? undefined
	: DeepPartial<RequestOf<N>>;

const client = createClient(PTSLDefinition, createChannel("localhost:31416"));

// Cached as a promise, so concurrent first calls share one registration.
// Reset when Pro Tools goes away, so the next call registers again.
let sessionIdPromise: Promise<string> | null = null;

const messageType = (name: string) =>
	(PTSL as unknown as Record<string, MessageFns<unknown> | undefined>)[name];

const commandId = (name: CommandName) => CommandId[`CId_${name}`];

const toRequest = (name: CommandName, request: unknown, sessionId?: string) => {
	const type = messageType(`${name}RequestBody`);
	return {
		header: {
			command: commandId(name),
			sessionId,
			version: API_VERSION,
			versionMinor: API_VERSION_MINOR,
		},
		requestBodyJson: JSON.stringify(
			type && request !== undefined
				? type.toJSON(type.fromPartial(request as DeepPartial<unknown>))
				: {},
		),
	};
};

const parseResponse = <N extends CommandName>(name: N, response: Response) => {
	const type = messageType(`${name}ResponseBody`);
	return (
		type ? type.fromJSON(JSON.parse(response.responseBodyJson || "{}")) : undefined
	) as ResponseOf<N>;
};

// Throws the first non-warning error of a response
function checkResponse(name: CommandName, response: Response) {
	if (response.responseErrorJson) {
		const { errors } = ResponseError.fromJSON(JSON.parse(response.responseErrorJson));
		const error = errors.find((e) => !e.isWarning);
		if (error) throw new Error(`Pro Tools: ${error.commandErrorMessage}`);
	}
	const status = response.header?.status;
	if (
		status === TaskStatus.TStatus_Failed ||
		status === TaskStatus.TStatus_FailedWithBadErrorResponse
	) {
		throw new Error(`Pro Tools: ${name} failed`);
	}
}

// gRPC errors become readable ones; an unreachable Pro Tools also drops the registration
function translateError(err: unknown): never {
	if (err instanceof ClientError && err.code === Status.UNAVAILABLE) {
		sessionIdPromise = null;
		throw new Error("Pro Tools is not running, or its scripting interface is disabled");
	}
	throw err;
}

async function call<N extends CommandName>(name: N, request: unknown, sessionId?: string) {
	const response = await client.sendGrpcRequest(toRequest(name, request, sessionId));
	checkResponse(name, response);
	return parseResponse(name, response);
}

async function register() {
	const { sessionId } = await call("RegisterConnection", {
		applicationName: "PostPin Desktop",
		companyName: "PostPin",
	} satisfies RequestArg<"RegisterConnection">);

	const { version, versionMinor } = await call("GetPTSLVersion", undefined, sessionId);
	if (version * 100 + versionMinor < MIN_VERSION * 100 + MIN_VERSION_MINOR) {
		throw new Error(
			`Pro Tools ${MIN_VERSION}.${MIN_VERSION_MINOR} or newer is required, found ${version}.${versionMinor}`,
		);
	}

	return sessionId;
}

function getSessionId() {
	sessionIdPromise ??= register().catch((err) => {
		sessionIdPromise = null;
		return translateError(err);
	});
	return sessionIdPromise;
}

// Sends a command by name, e.g. send("GetMemoryLocations", { paginationRequest: { limit: 100 } }),
// and returns its parsed response body
export async function send<N extends CommandName>(
	name: N,
	...[request]: RequestArg<N> extends undefined ? [] : [request: RequestArg<N>]
): Promise<ResponseOf<N>> {
	const sessionId = await getSessionId();
	try {
		return await call(name, request, sessionId);
	} catch (err) {
		return translateError(err);
	}
}

// Like send(), for long commands like ExportMix that report progress (0-100) while running
export async function sendWithProgress<N extends CommandName>(
	name: N,
	request: RequestArg<N>,
	onProgress: (percent: number) => void,
): Promise<ResponseOf<N>> {
	const sessionId = await getSessionId();
	try {
		let last: Response | null = null;
		for await (const response of client.sendGrpcStreamingRequest(
			toRequest(name, request, sessionId),
		)) {
			checkResponse(name, response);
			onProgress(response.header?.progress ?? 0);
			last = response;
		}
		if (!last) throw new Error(`Pro Tools: ${name} returned no response`);
		return parseResponse(name, last);
	} catch (err) {
		return translateError(err);
	}
}
