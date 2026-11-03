// Image imports resolve to a URL. The apps that bundle plugin-core (Vite) handle them.
declare module "*.png" {
	const src: string;
	export default src;
}
