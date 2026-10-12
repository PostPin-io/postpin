// src/users/usersController.ts
import { Controller, Get, Route } from "tsoa";
import spec from "../build/swagger.json";
import docsHtml from "./docs.html?raw";

@Route("v1")
export class SpecController extends Controller {
	@Get("openapi.json")
	public async getOpenApiSpec() {
		return spec;
	}

	@Get("docs")
	public async getDocsHtml() {
		return docsHtml;
	}
}
