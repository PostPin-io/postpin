/* eslint-disable */

export function $eipc_validator$_HostOption(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// HostOption.id
	if (!(typeof value.id === "string")) return false;

	// HostOption.name
	if (!(typeof value.name === "string")) return false;
	return true;
}
export function $eipc_validator$_AvailableUpdate(value: any): boolean {
	if (!value || typeof value !== "object") return false;

	// AvailableUpdate.version
	if (!(typeof value.version === "string")) return false;

	// AvailableUpdate.apiVersion
	if (typeof value.apiVersion !== "undefined") {
		if (!(typeof value.apiVersion === "number")) return false;
	}
	return true;
}
