/** The user closed the browser's passkey prompt, or another prompt replaced it: nothing to show */
export function isPasskeyCancel(error: { code?: string } | object): boolean {
	const code = "code" in error ? error.code : undefined;
	return code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED";
}
