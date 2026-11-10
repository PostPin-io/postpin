// Official app icons, scaled down to 128px: Resolve from Blackmagic Design's press kit,
// Premiere Pro and Pro Tools from their app bundles (pr_app_icons.icns, ProTools.icns)
import premiereIcon from "./logos/premiere-pro.png";
import proToolsIcon from "./logos/pro-tools.png";
import resolveIcon from "./logos/davinci-resolve.png";

// A single path drawn in currentColor, so it follows the theme
export interface MonochromeLogo {
	viewBox: string;
	path: string;
}

export interface HostInfo {
	// name shown in the UI, e.g. "DaVinci Resolve" for the hostName "Resolve"
	displayName: string;
	// URL of a full color image, a monochrome path, or null to show the initials
	logo: string | MonochromeLogo | null;
}

// Keyed by Capabilities.hostName. hostName stays short because it also names marker categories.
// The trademarks belong to their owners.
const HOSTS: Record<string, HostInfo> = {
	Resolve: { displayName: "DaVinci Resolve", logo: resolveIcon },
	"Pro Tools": { displayName: "Pro Tools", logo: proToolsIcon },
	"Premiere Pro": { displayName: "Premiere Pro", logo: premiereIcon },
	// TODO: Reaper and Baselight aren't in simple-icons or devicon, add their logos from the vendors' press kits
	Reaper: { displayName: "Reaper", logo: null },
	Baselight: { displayName: "Baselight", logo: null },
};

export function hostInfo(hostName: string): HostInfo {
	return HOSTS[hostName] ?? { displayName: hostName, logo: null };
}
