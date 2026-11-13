import { beforeEach, expect, it } from "vitest";
import { POSTPIN_API_VERSION } from "@postpin-io/shared/api-version";
import { ConfigController } from "../../../../src/api/controllers/ConfigController.ts";
import { fakes } from "../../../helpers/fakes.ts";
import { signInApi } from "../../../helpers/api.ts";
import { apiWorld, type ApiWorld } from "../../../helpers/api-world.ts";

let w: ApiWorld;
const controller = new ConfigController();

beforeEach(async () => {
	w = await apiWorld();
	await signInApi(w.owner.user, w.org.id);
});

it("plugins transcode by default, with the server's API version and renditions", async () => {
	expect(await controller.getConfig()).toEqual({
		apiVersion: POSTPIN_API_VERSION,
		// $app/env's version in the tests
		serverRelease: "test",
		transcode: {
			mode: "plugin",
			renditions: [
				{ width: 3840, height: 2160, bitRate: 20_000_000 },
				{ width: 1920, height: 1080, bitRate: 8_000_000 },
				{ width: 1280, height: 720, bitRate: 3_500_000 },
				{ width: 854, height: 480, bitRate: 1_200_000 },
			],
			audio: { codec: "aac", bitRate: 128_000 },
		},
	});
});

it("TRANSCODE_MODE=server leaves encoding to the server", async () => {
	fakes.transcodeMode = "server";
	expect((await controller.getConfig()).transcode.mode).toBe("server");
});
