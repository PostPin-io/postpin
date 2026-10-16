export function safeRedirect(target: string | null | undefined, fallback = "/dashboard") {
	if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
		return fallback;
	}
	return target;
}
