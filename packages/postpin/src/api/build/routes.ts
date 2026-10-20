/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from "@tsoa/runtime";
import { fetchMiddlewares, HapiTemplateService } from "@tsoa/runtime";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SpecController } from "./../controllers/SpecController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProjectController } from "./../controllers/ProjectController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MarkerController } from "./../controllers/MarkerController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ExportController } from "./../controllers/ExportController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { CategoryController } from "./../controllers/CategoryController";
import { boomify, isBoom, type Payload } from "@hapi/boom";
import type { Request, ResponseToolkit, RouteOptionsPreAllOptions } from "@hapi/hapi";

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
	Project: {
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
	DefaultSelection__36_ResponsePayload_: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
				content: { dataType: "string", required: true },
				markerId: { dataType: "string", required: true },
				authorId: { dataType: "string", required: true },
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
				nleId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
					required: true,
				},
				authorId: { dataType: "string", required: true },
				categoryId: { dataType: "string", required: true },
				exportId: { dataType: "string", required: true },
				updatedAt: { dataType: "datetime", required: true },
				createdAt: { dataType: "datetime", required: true },
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
			nleId: {
				dataType: "union",
				subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				required: true,
			},
			authorId: { dataType: "string", required: true },
			categoryId: { dataType: "string", required: true },
			exportId: { dataType: "string", required: true },
			updatedAt: { dataType: "datetime", required: true },
			createdAt: { dataType: "datetime", required: true },
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
				nleId: {
					dataType: "union",
					subSchemas: [{ dataType: "string" }, { dataType: "enum", enums: [null] }],
				},
				categoryId: { dataType: "string", required: true },
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
	MultipartUploadPartUrl: {
		dataType: "refObject",
		properties: {
			partNumber: { dataType: "double", required: true },
			url: { dataType: "string", required: true },
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
	Clip: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
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
	DefaultSelection__36_CategoryPayload_: {
		dataType: "refAlias",
		type: {
			dataType: "nestedObjectLiteral",
			nestedProperties: {
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
	const argsProjectController_getProjects: Record<string, TsoaRoute.ParameterSchema> = {};
	server.route({
		method: "get",
		path: "/v1/projects",
		options: {
			pre: [
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
	const argsExportController_getExports: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
		timelineId: { in: "path", name: "timelineId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports",
		options: {
			pre: [
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
			nestedProperties: { fileSize: { dataType: "double", required: true } },
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/init-upload",
		options: {
			pre: [
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
			nestedProperties: { uploadId: { dataType: "string", required: true } },
		},
	};
	server.route({
		method: "post",
		path: "/v1/projects/{projectId}/timelines/{timelineId}/exports/{exportId}/abort-upload",
		options: {
			pre: [
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
	const argsCategoryController_getCategories: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "string" },
	};
	server.route({
		method: "get",
		path: "/v1/projects/{projectId}/categories",
		options: {
			pre: [
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
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
