/* eslint-disable */

export function $eipc_validator$_HostOption(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// HostOption.id
	if (!(typeof value.id === "string")) return false;

	// HostOption.name
	if (!(typeof value.name === "string")) return false;
	return true;
}
