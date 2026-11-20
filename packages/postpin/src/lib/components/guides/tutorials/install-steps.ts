import type { DesktopOs } from "#lib/downloads.ts";

/**
 * The steps of every install tutorial (docs/guides/tutorials/plugin-workflow.md). The security
 * prompt comes as soon as the installer is opened, so it goes before "install".
 */
export const INSTALL_STEPS = [
	"download",
	"os-security",
	"install",
	"open-in-nle",
	"connect",
	"done",
] as const;
export type InstallStep = (typeof INSTALL_STEPS)[number];

/** The steps for one OS: without the security prompt where there is none */
export const installStepsFor = (os: DesktopOs, securityOn: readonly DesktopOs[]) =>
	INSTALL_STEPS.filter((s) => s !== "os-security" || securityOn.includes(os));
