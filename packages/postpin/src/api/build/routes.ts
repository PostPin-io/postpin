/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from "@tsoa/runtime";
import { fetchMiddlewares, HapiTemplateService } from "@tsoa/runtime";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SpecController } from "./../controllers/SpecController";
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ProjectController } from "./../controllers/ProjectController";
import { boomify, isBoom, type Payload } from "@hapi/boom";
import type { Request, ResponseToolkit, RouteOptionsPreAllOptions } from "@hapi/hapi";

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
	Project: {
		dataType: "refObject",
		properties: {
			id: { dataType: "string", required: true },
			name: { dataType: "string", required: true },
		},
		additionalProperties: false,
	},
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
	ProjectCreationParams: {
		dataType: "refObject",
		properties: {
			name: { dataType: "string", required: true },
		},
		additionalProperties: false,
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
	const argsProjectController_getProject: Record<string, TsoaRoute.ParameterSchema> = {
		projectId: { in: "path", name: "projectId", required: true, dataType: "double" },
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
	const argsProjectController_createProject: Record<string, TsoaRoute.ParameterSchema> = {
		requestBody: { in: "body", name: "requestBody", required: true, ref: "ProjectCreationParams" },
	};
	server.route({
		method: "post",
		path: "/v1/projects",
		options: {
			pre: [
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
					successStatus: 201,
				});
			},
		},
	});
	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

	// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
