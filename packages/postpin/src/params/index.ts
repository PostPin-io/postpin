import * as v from "valibot";

// Route param matchers: Standard Schemas that the [name=matcher] segments in src/routes use
export const params = {
	/** The landing page versions under /landing/<n>, see routes/(marketing)/landing */
	landingVersion: v.picklist(["1", "2", "3"]),
};
