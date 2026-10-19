// src/users/usersController.ts
import { Controller, Get, Route } from "tsoa";
import spec from "../build/swagger.json";
import docsHtml from "./docs.html?raw";

@Route("v1")
export class SpecController extends Controller {
	@Get("openapi.json")
	// Explicit return types: tsoa can't map the inferred JSON type (empty arrays become never[])
	public async getOpenApiSpec(): Promise<unknown> {
		return spec;
	}

	@Get("docs")
	public async getDocsHtml(): Promise<string> {
		return docsHtml;
	}
}
