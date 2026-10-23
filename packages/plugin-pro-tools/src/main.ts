import { createChannel, createClient } from "nice-grpc";
import {
	CommandId,
	PTSLDefinition,
	RegisterConnectionRequestBody,
	RegisterConnectionResponseBody,
	GetMemoryLocationsRequestBody,
	GetMemoryLocationsResponseBody,
	CreateMemoryLocationRequestBody,
	MarkerLocation,
	MemoryLocationReference,
	TimeProperties,
	GetSessionSampleRateResponseBody,
} from "./third-party/protools-sdk/dist/PTSL";

const channel = createChannel("localhost:31416");

const client = createClient(PTSLDefinition, channel);

const result = await client.sendGrpcRequest({
	header: {
		command: CommandId.CId_RegisterConnection,
		version: 2026,
		versionMinor: 4,
	},
	requestBodyJson: JSON.stringify(
		RegisterConnectionRequestBody.toJSON({
			applicationName: "PostPin",
			companyName: "Rüger Events - Software und Veranstaltungstechnik",
		}),
	),
});
const body = RegisterConnectionResponseBody.fromJSON(JSON.parse(result.responseBodyJson));
const sessionId = body.sessionId;

console.log("Session ID:", sessionId);

// load some markers
const r = await client.sendGrpcRequest({
	header: {
		command: CommandId.CId_GetMemoryLocations,
		version: 2026,
		versionMinor: 4,
		sessionId,
	},
	requestBodyJson: JSON.stringify(
		GetMemoryLocationsRequestBody.toJSON({ paginationRequest: { limit: 100, offset: 0 } }),
	),
});
console.log(GetMemoryLocationsResponseBody.fromJSON(JSON.parse(r.responseBodyJson)));

// clear all markers
await client.sendGrpcRequest({
	header: {
		command: CommandId.CId_ClearAllMemoryLocations,
		sessionId,
		version: 2026,
		versionMinor: 4,
	},
	requestBodyJson: JSON.stringify({}),
});

const sampleRateRequest = await client.sendGrpcRequest({
	header: {
		command: CommandId.CId_GetSessionSampleRate,
		sessionId,
		version: 2026,
		versionMinor: 4,
	},
	requestBodyJson: JSON.stringify({}),
});

const sampleRate: number = GetSessionSampleRateResponseBody.fromJSON(
	JSON.parse(sampleRateRequest.responseBodyJson),
).sampleRate;
console.log("Sample rate:", sampleRate);

// create some random colorful markers, one per second
for (let i = 0; i < 10; i++) {
	await client.sendGrpcRequest({
		header: {
			command: CommandId.CId_CreateMemoryLocation,
			sessionId,
			version: 2026,
			versionMinor: 4,
		},
		requestBodyJson: JSON.stringify(
			CreateMemoryLocationRequestBody.toJSON({
				name: `Marker ${i + 1}`,
				colorIndex: i % 8,
				comments: `This is marker ${i + 1}`,
				endTime: `${i * sampleRate}`,
				location: MarkerLocation.MarkerLocation_MainRuler,
				number: i + 1,
				reference: MemoryLocationReference.MLReference_Absolute,
				startTime: `${i * sampleRate}`,
				timeProperties: TimeProperties.TProperties_Marker,
				trackName: `Track ${i + 1}`,
				generalProperties: undefined,
			}),
		),
	});
}
