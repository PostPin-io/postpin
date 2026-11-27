// The bridge script is bundled as text (build.mjs: loader ".lua": "text")
declare module "*.lua" {
	const text: string;
	export default text;
}
