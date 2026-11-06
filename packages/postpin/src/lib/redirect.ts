const BASE = "http://redirect.invalid";

export function safeRedirect(target: string | null | undefined, fallback = "/dashboard") {
	if (!target?.startsWith("/")) return fallback;
	try {
		const url = new URL(target, BASE);
		if (url.origin !== BASE) return fallback;
		return url.pathname + url.search + url.hash;
	} catch {
		return fallback;
	}
}
