/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from "@tsoa/runtime";
import { fetchMiddlewares, HapiTemplateService } from "@tsoa/runtime";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { TimelineController } from "./../controllers/TimelineController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SpecController } from "./../controllers/SpecController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProjectController } from "./../controllers/ProjectController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MarkerSetController } from "./../controllers/MarkerSetController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MarkerController } from "./../controllers/MarkerController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ExportController } from "./../controllers/ExportController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ConfigController } from "./../controllers/ConfigController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CategoryController } from "./../controllers/CategoryController";
import { hapiAuthentication } from "./../authentication";
// @ts-ignore - no great way to install types from subpackage
import { boomify, isBoom, type Payload } from "@hapi/boom";
import type { Request, ResponseToolkit, RouteOptionsPreAllOptions } from "@hapi/hapi";

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
	ProjectWithOrg: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			name: { dataType: "string", required: true },
			createdAt: { dataType: "datetime", required: true },
			updatedAt: { dataType: "datetime", required: true },
			nleProjectId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			organization: {
				dataType: "nestedObjectLiteral",
				nestedProperties: {
					name: { dataType: "string", required: true },
					id: { dataType: "string", required: true },
				},
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	Timeline: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			name: { dataType: "string", required: true },
			createdAt: { dataType: "datetime", required: true },
			updatedAt: { dataType: "datetime", required: true },
			nleTimelineId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ProjectWithTimelines: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			name: { dataType: "string", required: true },
			createdAt: { dataType: "datetime", required: true },
			updatedAt: { dataType: "datetime", required: true },
			nleProjectId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			timelines: {
				dataType: "array",
				array: { dataType: "refObject", ref: "Timeline" },
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetAction: {
		dataType: "refAlias",
		type: {
			dataType: "union",
			subSchemas: [
				{ dataType: "enum", enums: ["PUSH"] },
				{ dataType: "enum", enums: ["PULL"] },
				{ dataType: "enum", enums: ["CLEAR"] },
				{ dataType: "enum", enums: ["RESTORE"] },
			],
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetSideSummary: {
		dataType: "refObject",
		properties: {
			added: { dataType: "double", required: true },
			updated: { dataType: "double", required: true },
			removed: { dataType: "double", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetSummary: {
		dataType: "refObject",
		properties: {
			nle: { ref: "MarkerSetSideSummary" },
			postpin: { ref: "MarkerSetSideSummary" },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetListItem: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			action: { ref: "MarkerSetAction", required: true },
			timelineId: { dataType: "string", required: true },
			exportId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			exportName: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			nleTimelineId: { dataType: "string", required: true },
			nleTimelineName: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			hostName: { dataType: "string", required: true },
			createdAt: { dataType: "datetime", required: true },
			createdBy: {
				dataType: "union",
				subSchemas: [
					{
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							name: { dataType: "string", required: true },
							id: { dataType: "string", required: true },
						},
					},
					{ dataType: "enum", enums: [null] },
				],
				required: true,
			},
			summary: { ref: "MarkerSetSummary", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	NleMarkerSnapshotEntry: {
		dataType: "refObject",
		properties: {
			nleId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			title: { dataType: "string", required: true },
			description: { dataType: "string", required: true },
			frame: { dataType: "double", required: true },
			duration: { dataType: "double" },
			color: { dataType: "string", required: true },
			customData: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	NleMarkerSnapshot: {
		dataType: "refObject",
		properties: {
			format: { dataType: "double", required: true },
			markers: {
				dataType: "array",
				array: { dataType: "refObject", ref: "NleMarkerSnapshotEntry" },
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	PostPinResponseSnapshot: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			content: { dataType: "string", required: true },
			authorId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			createdAt: { dataType: "string", required: true },
			updatedAt: { dataType: "string", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	PostPinPointerSnapshot: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			kind: {
				dataType: "union",
				subSchemas: [
					{ dataType: "enum", enums: ["ARROW"] },
					{ dataType: "enum", enums: ["RECT"] },
				],
				required: true,
			},
			x: { dataType: "double", required: true },
			y: { dataType: "double", required: true },
			width: {
				dataType: "union",
				subSchemas: [{ dataType: "double" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			height: {
				dataType: "union",
				subSchemas: [{ dataType: "double" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			color: { dataType: "string", required: true },
			createdAt: { dataType: "string", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	PostPinMarkerSnapshotEntry: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			name: { dataType: "string", required: true },
			description: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			frame: { dataType: "double", required: true },
			duration: { dataType: "double", required: true },
			categoryId: { dataType: "string", required: true },
			categoryName: { dataType: "string", required: true },
			categoryColor: { dataType: "string", required: true },
			nleId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			nleTimelineId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			syncHash: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			authorId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			guestId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			createdAt: { dataType: "string", required: true },
			responses: {
				dataType: "array",
				array: { dataType: "refObject", ref: "PostPinResponseSnapshot" },
				required: true,
			},
			pointers: {
				dataType: "array",
				array: { dataType: "refObject", ref: "PostPinPointerSnapshot" },
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	PostPinMarkerSnapshot: {
		dataType: "refObject",
		properties: {
			format: { dataType: "double", required: true },
			markers: {
				dataType: "array",
				array: { dataType: "refObject", ref: "PostPinMarkerSnapshotEntry" },
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetDetail: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			action: { ref: "MarkerSetAction", required: true },
			timelineId: { dataType: "string", required: true },
			exportId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			exportName: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			nleTimelineId: { dataType: "string", required: true },
			nleTimelineName: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			hostName: { dataType: "string", required: true },
			createdAt: { dataType: "datetime", required: true },
			createdBy: {
				dataType: "union",
				subSchemas: [
					{
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							name: { dataType: "string", required: true },
							id: { dataType: "string", required: true },
						},
					},
					{ dataType: "enum", enums: [null] },
				],
				required: true,
			},
			summary: { ref: "MarkerSetSummary", required: true },
			nleMarkers: { ref: "NleMarkerSnapshot", required: true },
			postpinMarkers: {
				dataType: "union",
				subSchemas: [{ ref: "PostPinMarkerSnapshot" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetCreate: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				summary: { ref: "MarkerSetSummary", required: true },
				nleMarkers: {
					dataType: "array",
					array: { dataType: "refObject", ref: "NleMarkerSnapshotEntry" },
					required: true,
				},
				hostName: { dataType: "string", required: true },
				nleTimelineName: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				nleTimelineId: { dataType: "string", required: true },
				exportId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				action: {
					dataType: "union",
					subSchemas: [
						{ dataType: "enum", enums: ["PULL"] },
						{ dataType: "enum", enums: ["CLEAR"] },
						{ dataType: "enum", enums: ["RESTORE"] },
					],
					required: true,
				},
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetRestoreResult: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				summary: { ref: "MarkerSetSummary", required: true },
				markerSetId: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerSetRestore: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				nleSummary: { ref: "MarkerSetSideSummary" },
				nleMarkers: {
					dataType: "array",
					array: { dataType: "refObject", ref: "NleMarkerSnapshotEntry" },
					required: true,
				},
				hostName: { dataType: "string", required: true },
				nleTimelineName: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				nleTimelineId: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	DefaultSelection__36_ResponsePayload_: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				content: { dataType: "string", required: true },
				markerId: { dataType: "string", required: true },
				authorId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				updatedAt: { dataType: "datetime", required: true },
				createdAt: { dataType: "datetime", required: true },
				id: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ResponseModel: {
		dataType: "refAlias",
		type: { ref: "DefaultSelection__36_ResponsePayload_", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerResponse: {
		dataType: "refAlias",
		type: { ref: "ResponseModel", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	DefaultSelection__36_MarkerPayload_: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				syncHash: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				nleTimelineId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				nleId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				guestId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				authorId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				categoryId: { dataType: "string", required: true },
				exportId: { dataType: "string", required: true },
				updatedAt: { dataType: "datetime", required: true },
				createdAt: { dataType: "datetime", required: true },
				duration: { dataType: "double", required: true },
				frame: { dataType: "double", required: true },
				description: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				id: { dataType: "string", required: true },
				name: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerModel: {
		dataType: "refAlias",
		type: { ref: "DefaultSelection__36_MarkerPayload_", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerWithResponses: {
		dataType: "refObject",
		properties: {
			syncHash: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			nleTimelineId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			nleId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			guestId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			authorId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			categoryId: { dataType: "string", required: true },
			exportId: { dataType: "string", required: true },
			updatedAt: { dataType: "datetime", required: true },
			createdAt: { dataType: "datetime", required: true },
			duration: { dataType: "double", required: true },
			frame: { dataType: "double", required: true },
			description: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			id: { dataType: "string", required: true },
			name: { dataType: "string", required: true },
			responses: {
				dataType: "array",
				array: { dataType: "refAlias", ref: "MarkerResponse" },
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	UploadMarker: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				id: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				nleId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				categoryId: { dataType: "string", required: true },
				duration: { dataType: "integer", validators: { minimum: { value: 0 } } },
				frame: { dataType: "double", required: true },
				description: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				name: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerOrigin: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				webUpload: { dataType: "boolean", required: true },
				frameRate: {
					dataType: "union",
					subSchemas: [
						{
							dataType: "nestedObjectLiteral",
							nestedProperties: {
								dropFrame: { dataType: "boolean", required: true },
								fpsDenominator: { dataType: "double", required: true },
								fpsNumerator: { dataType: "double", required: true },
							},
						},
						{ dataType: "enum", enums: [null] },
					],
					required: true,
				},
				startFrameIndex: {
					dataType: "union",
					subSchemas: [{ dataType: "double" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	DefaultSelection__36_DeletedMarkerPayload_: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				deletedAt: { dataType: "datetime", required: true },
				markerId: { dataType: "string", required: true },
				syncHash: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				nleTimelineId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				nleId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				exportId: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	DeletedMarkerModel: {
		dataType: "refAlias",
		type: { ref: "DefaultSelection__36_DeletedMarkerPayload_", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	DeletedMarker: {
		dataType: "refAlias",
		type: { ref: "DeletedMarkerModel", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerPushResult: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				markers: {
					dataType: "array",
					array: {
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							nleId: {
								dataType: "union",
								subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
								required: true,
							},
							id: { dataType: "string", required: true },
						},
					},
					required: true,
				},
				markerSetId: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	SyncMarker: {
		dataType: "refAlias",
		type: {
			dataType: "intersection",
			subSchemas: [
				{ ref: "UploadMarker" },
				{
					dataType: "nestedObjectLiteral",
					nestedProperties: {
						syncHash: {
							dataType: "union",
							subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
						},
					},
				},
			],
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerPush: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				summary: { ref: "MarkerSetSummary", required: true },
				deleteIds: { dataType: "array", array: { dataType: "string" }, required: true },
				upserts: {
					dataType: "array",
					array: { dataType: "refAlias", ref: "SyncMarker" },
					required: true,
				},
				nleMarkers: {
					dataType: "array",
					array: { dataType: "refObject", ref: "NleMarkerSnapshotEntry" },
					required: true,
				},
				hostName: { dataType: "string", required: true },
				nleTimelineName: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				nleTimelineId: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MarkerLinks: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				forgetDeleted: { dataType: "array", array: { dataType: "string" }, required: true },
				links: {
					dataType: "array",
					array: {
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							syncHash: {
								dataType: "union",
								subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
								required: true,
							},
							nleId: {
								dataType: "union",
								subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
								required: true,
							},
							id: { dataType: "string", required: true },
						},
					},
					required: true,
				},
				nleTimelineId: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MultipartUploadPartUrl: {
		dataType: "refObject",
		properties: {
			partNumber: { dataType: "double", required: true },
			url: { dataType: "string", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ProxyUpload: {
		dataType: "refObject",
		properties: {
			uploadId: { dataType: "string", required: true },
			partSize: { dataType: "double", required: true },
			parts: {
				dataType: "array",
				array: { dataType: "refObject", ref: "MultipartUploadPartUrl" },
				required: true,
			},
			proxyId: { dataType: "string", required: true },
			width: { dataType: "double", required: true },
			height: { dataType: "double", required: true },
			bitRate: { dataType: "double", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	InitUploadResponse: {
		dataType: "refObject",
		properties: {
			uploadId: { dataType: "string", required: true },
			partSize: { dataType: "double", required: true },
			parts: {
				dataType: "array",
				array: { dataType: "refObject", ref: "MultipartUploadPartUrl" },
				required: true,
			},
			mediaId: { dataType: "string", required: true },
			proxies: { dataType: "array", array: { dataType: "refObject", ref: "ProxyUpload" } },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ProxyUploadRequest: {
		dataType: "refObject",
		properties: {
			width: { dataType: "double", required: true },
			height: { dataType: "double", required: true },
			bitRate: { dataType: "double", required: true },
			fileSize: { dataType: "double", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	CompleteUploadResponse: {
		dataType: "refObject",
		properties: {
			transcodedBy: {
				dataType: "union",
				subSchemas: [
					{ dataType: "enum", enums: ["plugin"] },
					{ dataType: "enum", enums: ["server"] },
				],
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	UploadedPart: {
		dataType: "refObject",
		properties: {
			partNumber: { dataType: "double", required: true },
			etag: { dataType: "string", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	TrackType: {
		dataType: "refAlias",
		type: {
			dataType: "union",
			subSchemas: [
				{ dataType: "enum", enums: ["video"] },
				{ dataType: "enum", enums: ["audio"] },
			],
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	"Record_string.unknown_": {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {},
			additionalProperties: { dataType: "any" },
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ClipColor: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				hex: { dataType: "string", required: true },
				name: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	Clip: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				color: {
					dataType: "union",
					subSchemas: [{ ref: "ClipColor" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				metadata: { ref: "Record_string.unknown_", required: true },
				speed: { dataType: "double", required: true },
				sourceStartFrameIndex: {
					dataType: "union",
					subSchemas: [{ dataType: "double" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				durationFrameCount: { dataType: "double", required: true },
				startFrameIndex: { dataType: "double", required: true },
				mediaId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				name: { dataType: "string", required: true },
				id: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	Track: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				clips: { dataType: "array", array: { dataType: "refAlias", ref: "Clip" }, required: true },
				name: { dataType: "string", required: true },
				type: { ref: "TrackType", required: true },
				id: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	FrameRate: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				dropFrame: { dataType: "boolean", required: true },
				fpsDenominator: { dataType: "double", required: true },
				fpsNumerator: { dataType: "double", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	MediaItem: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				metadata: { ref: "Record_string.unknown_", required: true },
				startTimecode: { dataType: "string", required: true },
				frameRate: { ref: "FrameRate", required: true },
				filePath: { dataType: "string", required: true },
				type: {
					dataType: "union",
					subSchemas: [
						{ dataType: "enum", enums: ["video"] },
						{ dataType: "enum", enums: ["audio"] },
					],
					required: true,
				},
				name: { dataType: "string", required: true },
				id: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	TimelineSnapshot: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				metadata: { ref: "Record_string.unknown_", required: true },
				durationFrameCount: { dataType: "double", required: true },
				startFrameIndex: { dataType: "double", required: true },
				frameRate: { ref: "FrameRate", required: true },
				mediaItems: {
					dataType: "array",
					array: { dataType: "refAlias", ref: "MediaItem" },
					required: true,
				},
				tracks: {
					dataType: "array",
					array: { dataType: "refAlias", ref: "Track" },
					required: true,
				},
				name: { dataType: "string", required: true },
				id: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	UploadedProxy: {
		dataType: "refObject",
		properties: {
			proxyId: { dataType: "string", required: true },
			uploadId: { dataType: "string", required: true },
			parts: {
				dataType: "array",
				array: { dataType: "refObject", ref: "UploadedPart" },
				required: true,
			},
			hls: {
				dataType: "nestedObjectLiteral",
				nestedProperties: {
					segments: {
						dataType: "array",
						array: {
							dataType: "nestedObjectLiteral",
							nestedProperties: {
								length: { dataType: "double", required: true },
								offset: { dataType: "double", required: true },
								duration: { dataType: "double", required: true },
							},
						},
						required: true,
					},
					init: {
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							length: { dataType: "double", required: true },
							offset: { dataType: "double", required: true },
						},
						required: true,
					},
				},
				required: true,
			},
			hasAudio: { dataType: "boolean", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ProxyRendition: {
		dataType: "refObject",
		properties: {
			width: { dataType: "double", required: true },
			height: { dataType: "double", required: true },
			bitRate: { dataType: "double", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ClientConfig: {
		dataType: "refObject",
		properties: {
			apiVersion: { dataType: "double", required: true },
			serverRelease: { dataType: "string", required: true },
			transcode: {
				dataType: "nestedObjectLiteral",
				nestedProperties: {
					audio: {
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							bitRate: { dataType: "double", required: true },
							codec: { dataType: "string", required: true },
						},
						required: true,
					},
					renditions: {
						dataType: "array",
						array: { dataType: "refObject", ref: "ProxyRendition" },
						required: true,
					},
					mode: {
						dataType: "union",
						subSchemas: [
							{ dataType: "enum", enums: ["plugin"] },
							{ dataType: "enum", enums: ["server"] },
						],
						required: true,
					},
				},
				required: true,
			},
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	DefaultSelection__36_CategoryPayload_: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				createdById: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				projectId: { dataType: "string", required: true },
				color: { dataType: "string", required: true },
				updatedAt: { dataType: "datetime", required: true },
				createdAt: { dataType: "datetime", required: true },
				id: { dataType: "string", required: true },
				name: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	CategoryModel: {
		dataType: "refAlias",
		type: { ref: "DefaultSelection__36_CategoryPayload_", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	Category: {
		dataType: "refAlias",
		type: { ref: "CategoryModel", validators: {} },
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	CategoryCreateParams: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				color: { dataType: "string", required: true },
				name: { dataType: "string", required: true },
			},
			validators: {},
		},
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new HapiTemplateService(
	models,
	{ noImplicitAdditionalProperties: "throw-on-extras", bodyCoercion: true },
	{ boomify, isBoom },
);

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

export function RegisterRoutes(server: any) {
	// ###########################################################################################################
	//  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
	//      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
	// ###########################################################################################################
	const argsTimelineController_createTimeline: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: { name: { dataType: "string", required: true } },
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(TimelineController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(TimelineController.prototype.createTimeline),
			],
			handler: function TimelineController_createTimeline(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsTimelineController_createTimeline,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new TimelineController();

				return templateService.apiHandler({
					methodName: "createTimeline",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsSpecController_getOpenApiSpec: Record<string, TsoaRoute.ParameterSchema> = {};
	server.route({
		method: "get",
		path: "/v1/openapi.json",
		options: {
			pre: [
				...fetchMiddlewares<RouteOptionsPreAllOptions>(SpecController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(SpecController.prototype.getOpenApiSpec),
			],
			handler: function SpecController_getOpenApiSpec(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsSpecController_getOpenApiSpec,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new SpecController();

				return templateService.apiHandler({
					methodName: "getOpenApiSpec",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsSpecController_getDocsHtml: Record<string, TsoaRoute.ParameterSchema> = {};
	server.route({
		method: "get",
		path: "/v1/docs",
		options: {
			pre: [
				...fetchMiddlewares<RouteOptionsPreAllOptions>(SpecController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(SpecController.prototype.getDocsHtml),
			],
			handler: function SpecController_getDocsHtml(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsSpecController_getDocsHtml,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new SpecController();

				return templateService.apiHandler({
					methodName: "getDocsHtml",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsProjectController_getProjects: Record<string, TsoaRoute.ParameterSchema> = {
		request: { in: "request", name: "request", required: true, dataType: "object" },
	};
	server.route({
		method: "get",
		path: "/v1/projects",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ProjectController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ProjectController.prototype.getProjects),
			],
			handler: function ProjectController_getProjects(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsProjectController_getProjects,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ProjectController();

				return templateService.apiHandler({
					methodName: "getProjects",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsProjectController_getProject: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ProjectController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ProjectController.prototype.getProject),
			],
			handler: function ProjectController_getProject(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsProjectController_getProject,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ProjectController();

				return templateService.apiHandler({
					methodName: "getProject",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsProjectController_createProject: Record<string, TsoaRoute.ParameterSchema> = {
		request: { in: "request", name: "request", required: true, dataType: "object" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				organizationId: { dataType: "string" },
				name: { dataType: "string", required: true },
			},
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ProjectController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ProjectController.prototype.createProject),
			],
			handler: function ProjectController_createProject(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsProjectController_createProject,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ProjectController();

				return templateService.apiHandler({
					methodName: "createProject",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerSetController_getMarkerSets: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		nleTimelineId: { in: "query", name: "nleTimelineId", dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/marker-sets",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerSetController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerSetController.prototype.getMarkerSets),
			],
			handler: function MarkerSetController_getMarkerSets(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerSetController_getMarkerSets,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerSetController();

				return templateService.apiHandler({
					methodName: "getMarkerSets",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerSetController_getMarkerSet: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		markerSetId: { in: "path", name: "markerSetId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/marker-sets/{markerSetId}",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerSetController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerSetController.prototype.getMarkerSet),
			],
			handler: function MarkerSetController_getMarkerSet(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerSetController_getMarkerSet,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerSetController();

				return templateService.apiHandler({
					methodName: "getMarkerSet",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerSetController_createMarkerSet: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		body: { in: "body", name: "body", required: true, ref: "MarkerSetCreate" },
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/marker-sets",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerSetController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(
					MarkerSetController.prototype.createMarkerSet,
				),
			],
			handler: function MarkerSetController_createMarkerSet(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerSetController_createMarkerSet,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerSetController();

				return templateService.apiHandler({
					methodName: "createMarkerSet",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerSetController_restoreMarkerSet: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		markerSetId: { in: "path", name: "markerSetId", required: true, dataType: "string" },
		body: { in: "body", name: "body", required: true, ref: "MarkerSetRestore" },
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/marker-sets/{markerSetId}/restore",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerSetController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(
					MarkerSetController.prototype.restoreMarkerSet,
				),
			],
			handler: function MarkerSetController_restoreMarkerSet(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerSetController_restoreMarkerSet,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerSetController();

				return templateService.apiHandler({
					methodName: "restoreMarkerSet",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerController_getMarkers: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController.prototype.getMarkers),
			],
			handler: function MarkerController_getMarkers(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerController_getMarkers,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerController();

				return templateService.apiHandler({
					methodName: "getMarkers",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerController_uploadMarkers: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		markers: {
			in: "body",
			name: "markers",
			required: true,
			dataType: "array",
			array: { dataType: "refAlias", ref: "UploadMarker" },
		},
	};
	server.route({
		method: "put",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController.prototype.uploadMarkers),
			],
			handler: function MarkerController_uploadMarkers(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerController_uploadMarkers,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerController();

				return templateService.apiHandler({
					methodName: "uploadMarkers",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerController_getMarkerOrigin: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers/origin",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController.prototype.getMarkerOrigin),
			],
			handler: function MarkerController_getMarkerOrigin(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerController_getMarkerOrigin,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerController();

				return templateService.apiHandler({
					methodName: "getMarkerOrigin",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerController_getDeletedMarkers: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers/deleted",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(
					MarkerController.prototype.getDeletedMarkers,
				),
			],
			handler: function MarkerController_getDeletedMarkers(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerController_getDeletedMarkers,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerController();

				return templateService.apiHandler({
					methodName: "getDeletedMarkers",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerController_syncMarkers: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		body: { in: "body", name: "body", required: true, ref: "MarkerPush" },
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers/sync",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController.prototype.syncMarkers),
			],
			handler: function MarkerController_syncMarkers(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerController_syncMarkers,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerController();

				return templateService.apiHandler({
					methodName: "syncMarkers",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsMarkerController_linkMarkers: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		body: { in: "body", name: "body", required: true, ref: "MarkerLinks" },
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/markers/links",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(MarkerController.prototype.linkMarkers),
			],
			handler: function MarkerController_linkMarkers(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsMarkerController_linkMarkers,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new MarkerController();

				return templateService.apiHandler({
					methodName: "linkMarkers",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsExportController_getExports: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController.prototype.getExports),
			],
			handler: function ExportController_getExports(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsExportController_getExports,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ExportController();

				return templateService.apiHandler({
					methodName: "getExports",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsExportController_createExport: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				name: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				nleProjectId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				nleTimelineId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
			},
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController.prototype.createExport),
			],
			handler: function ExportController_createExport(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsExportController_createExport,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ExportController();

				return templateService.apiHandler({
					methodName: "createExport",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsExportController_initUpload: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				proxies: { dataType: "array", array: { dataType: "refObject", ref: "ProxyUploadRequest" } },
				fileSize: { dataType: "double", required: true },
			},
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/init-upload",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController.prototype.initUpload),
			],
			handler: function ExportController_initUpload(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsExportController_initUpload,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ExportController();

				return templateService.apiHandler({
					methodName: "initUpload",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsExportController_initProxyUploads: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				proxies: {
					dataType: "array",
					array: { dataType: "refObject", ref: "ProxyUploadRequest" },
					required: true,
				},
			},
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/init-proxy-uploads",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController.prototype.initProxyUploads),
			],
			handler: function ExportController_initProxyUploads(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsExportController_initProxyUploads,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ExportController();

				return templateService.apiHandler({
					methodName: "initProxyUploads",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsExportController_completeUpload: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				proxies: { dataType: "array", array: { dataType: "refObject", ref: "UploadedProxy" } },
				timelineSnapshot: { ref: "TimelineSnapshot", required: true },
				parts: {
					dataType: "array",
					array: { dataType: "refObject", ref: "UploadedPart" },
					required: true,
				},
				uploadId: { dataType: "string", required: true },
			},
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/complete-upload",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController.prototype.completeUpload),
			],
			handler: function ExportController_completeUpload(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsExportController_completeUpload,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ExportController();

				return templateService.apiHandler({
					methodName: "completeUpload",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsExportController_abortUpload: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
		exportId: { in: "path", name: "exportId", required: true, dataType: "string" },
		body: {
			in: "body",
			name: "body",
			required: true,
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				proxies: {
					dataType: "array",
					array: {
						dataType: "nestedObjectLiteral",
						nestedProperties: {
							uploadId: { dataType: "string", required: true },
							proxyId: { dataType: "string", required: true },
						},
					},
				},
				uploadId: { dataType: "string", required: true },
			},
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/abort-upload",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ExportController.prototype.abortUpload),
			],
			handler: function ExportController_abortUpload(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsExportController_abortUpload,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ExportController();

				return templateService.apiHandler({
					methodName: "abortUpload",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsConfigController_getConfig: Record<string, TsoaRoute.ParameterSchema> = {};
	server.route({
		method: "get",
		path: "/v1/config",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ConfigController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(ConfigController.prototype.getConfig),
			],
			handler: function ConfigController_getConfig(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsConfigController_getConfig,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new ConfigController();

				return templateService.apiHandler({
					methodName: "getConfig",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsCategoryController_getCategories: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/categories",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(CategoryController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(CategoryController.prototype.getCategories),
			],
			handler: function CategoryController_getCategories(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsCategoryController_getCategories,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new CategoryController();

				return templateService.apiHandler({
					methodName: "getCategories",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	const argsCategoryController_createCategory: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		body: { in: "body", name: "body", required: true, ref: "CategoryCreateParams" },
	};
	server.route({
		method: "put",
		path: "/v1/projects/{projectId}/categories",
		options: {
			pre: [
				{
					method: authenticateMiddleware([{ session: [] }]),
				},
				...fetchMiddlewares<RouteOptionsPreAllOptions>(CategoryController),
				...fetchMiddlewares<RouteOptionsPreAllOptions>(CategoryController.prototype.createCategory),
			],
			handler: function CategoryController_createCategory(request: Request, h: ResponseToolkit) {
				let validatedArgs: any[] = [];
				try {
					validatedArgs = templateService.getValidatedArgs({
						args: argsCategoryController_createCategory,
						request,
						h,
					});
				} catch (err) {
					const error = err as any;
					if (isBoom(error)) {
						throw error;
					}

					const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
						statusCode: error.status || 500,
					});
					boomErr.output.statusCode = error.status || 500;
					boomErr.output.payload = {
						name: error.name,
						fields: error.fields,
						message: error.message,
					} as unknown as Payload;
					throw boomErr;
				}

				const controller = new CategoryController();

				return templateService.apiHandler({
					methodName: "createCategory",
					controller,
					h,
					validatedArgs,
					successStatus: undefined,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

	function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
		return async function runAuthenticationMiddleware(request: any, h: any) {
			// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

			// keep track of failed auth attempts so we can hand back the most
			// recent one.  This behavior was previously existing so preserving it
			// here
			const failedAttempts: any[] = [];
			const pushAndRethrow = (error: any) => {
				failedAttempts.push(error);
				throw error;
			};

			const secMethodOrPromises: Promise<any>[] = [];
			for (const secMethod of security) {
				if (Object.keys(secMethod).length > 1) {
					const secMethodAndPromises: Promise<any>[] = [];

					for (const name in secMethod) {
						secMethodAndPromises.push(
							hapiAuthentication(request, name, secMethod[name]).catch(pushAndRethrow),
						);
					}

					// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

					secMethodOrPromises.push(
						Promise.all(secMethodAndPromises).then((users) => {
							return users[0];
						}),
					);
				} else {
					for (const name in secMethod) {
						secMethodOrPromises.push(
							hapiAuthentication(request, name, secMethod[name]).catch(pushAndRethrow),
						);
					}
				}
			}

			// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

			try {
				request["user"] = await Promise.any(secMethodOrPromises);
				return request["user"];
			} catch (err) {
				// Show most recent error as response
				const error = failedAttempts.pop();
				if (isBoom(error)) {
					throw error;
				}

				const boomErr = boomify(error instanceof Error ? error : new Error(error.message), {
					statusCode: error.status || 500,
				});
				boomErr.output.statusCode = error.status || 401;
				boomErr.output.payload = {
					name: error.name,
					message: error.message,
				} as unknown as Payload;

				throw boomErr;
			}

			// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
		};
	}

	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
