// REAPER's ini files as PostPin changes them (setup.ts). Pure, so it can be tested without
// Electron. Read and written as latin1, so every byte the user has in them stays as it was.

/** The bridge action's command id: "_" + this runs it over the web interface */
export const ACTION_ID = "RSpostpin_bridge";
/** The bridge script, relative to REAPER's Scripts folder */
export const SCRIPT_PATH = "PostPin/postpin_bridge.lua";
const USER = "postpin";

export interface Endpoint {
	port: number;
	password: string;
}

/** The web interface line: HTTP <flags> <port> '<user:password>' '<default page>' <?> '<?>' */
const webInterface = ({ port, password }: Endpoint) =>
	`HTTP 0 ${port} '${USER}:${password}' '' 0 ''`;

const actionLine = `SCR 4 0 ${ACTION_ID} "Custom: PostPin bridge (used by PostPin Desktop)" ${SCRIPT_PATH}`;

const isOurWebInterface = (value: string) =>
	value.startsWith("HTTP ") && value.includes(`'${USER}:`);

/** reaper.ini with exactly one web interface of ours, the user's ones renumbered around it */
export function withWebInterface(ini: string, endpoint: Endpoint): string {
	const lines = ini.split(/\r?\n/);
	const eol = ini.includes("\r\n") ? "\r\n" : "\n";
	const section = lines.findIndex((line) => line.trim().toLowerCase() === "[reaper]");
	if (section < 0) throw new Error("REAPER's settings file has no [REAPER] section");
	let sectionEnd = lines.findIndex((line, i) => i > section && line.startsWith("["));
	if (sectionEnd < 0) sectionEnd = lines.length;

	const body = lines.slice(section + 1, sectionEnd);
	const isSurface = (line: string) => /^csurf_(\d+|cnt)=/.test(line);
	const surfaces = body
		.map((line) => /^csurf_\d+=(.*)$/.exec(line)?.[1])
		.filter((value): value is string => value !== undefined && !isOurWebInterface(value));
	surfaces.push(webInterface(endpoint));
	const block = [
		...surfaces.map((value, i) => `csurf_${i}=${value}`),
		`csurf_cnt=${surfaces.length}`,
	];

	// where the control surfaces were; without any, at the end of the section (before empty lines)
	let at = body.findIndex(isSurface);
	const rest = body.filter((line) => !isSurface(line));
	if (at < 0) {
		at = rest.length;
		while (at > 0 && rest[at - 1] === "") at--;
	}
	return [
		...lines.slice(0, section + 1),
		...rest.slice(0, at),
		...block,
		...rest.slice(at),
		...lines.slice(sectionEnd),
	].join(eol);
}

export const hasWebInterface = (ini: string, endpoint: Endpoint) =>
	ini.split(/\r?\n/).some((line) => line.replace(/^csurf_\d+=/, "") === webInterface(endpoint));

/** reaper-kb.ini with the bridge action, once */
export function withAction(kb: string): string {
	const eol = kb.includes("\r\n") ? "\r\n" : "\n";
	const lines = kb.split(/\r?\n/).filter((line) => !line.includes(` ${ACTION_ID} `));
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return [...lines, actionLine, ""].join(eol);
}

export const hasAction = (kb: string) => kb.split(/\r?\n/).includes(actionLine);
