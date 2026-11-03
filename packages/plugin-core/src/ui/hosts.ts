// Official app icon from Blackmagic Design's press kit, scaled down to 128px
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
// Pro Tools: simple-icons (CC0), Premiere Pro: devicon (MIT). The trademarks belong to their owners.
const HOSTS: Record<string, HostInfo> = {
	Resolve: { displayName: "DaVinci Resolve", logo: resolveIcon },
	"Pro Tools": {
		displayName: "Pro Tools",
		logo: {
			viewBox: "0 0 24 24",
			path: "M.505 15.452Q.27 14.63.14 13.762.01 12.891.01 12q0-2.49.94-4.673.94-2.184 2.572-3.804Q5.155 1.902 7.339.938 9.523 0 12.012 0q2.465 0 4.65.94 2.183.962 3.815 2.583 1.633 1.62 2.572 3.804.94 2.184.94 4.673 0 .869-.118 1.714-.118.846-.352 1.644.21.047.34.07l.13.024-1.363 3.429-.188-.012-.54-.106Q21.1 19.937 20.02 20.9q-1.057.987-2.325 1.668-1.268.68-2.724 1.056-1.433.376-2.96.376-1.55 0-3.005-.376-1.433-.375-2.7-1.068-1.269-.693-2.35-1.656-1.08-.963-1.878-2.16-.282.094-.434.117l-.153.024-1.48-3.382.118.012.376-.059zM22.744 12q0-2.23-.846-4.18-.845-1.95-2.301-3.405-1.456-1.456-3.429-2.301-1.949-.846-4.156-.846-2.231 0-4.18.846-1.973.845-3.429 2.3Q2.947 5.872 2.102 7.82 1.256 9.77 1.256 12q0 .751.106 1.491.106.74.317 1.444.892-.516 2.02-1.972 1.127-1.456 1.808-2.912.352-.728.916-1.597.54-.869 1.338-1.632.799-.763 1.855-1.256 1.057-.517 2.396-.517 1.315 0 2.419.587 1.103.587 1.913 1.35.81.764 1.304 1.492.516.727.657.986.165.282.47.94.329.633.728 1.361.4.728.822 1.433.423.68.798 1.033.259.258.564.446.305.188.61.329.212-.728.33-1.48.117-.751.117-1.526zM12.012 22.732q1.338 0 2.583-.305 1.268-.33 2.383-.916 1.116-.587 2.055-1.41.94-.821 1.668-1.83-.94-.494-2.173-1.645-1.233-1.15-2.5-3.358-.142-.235-.494-.94-.352-.704-.857-1.455-.505-.752-1.115-1.339t-1.268-.587q-.681 0-1.386.634-.704.61-1.303 1.386-.6.775-1.022 1.503-.423.704-.54.916-1.174 2.066-2.477 3.205-1.304 1.139-2.29 1.656.728 1.01 1.667 1.831.963.846 2.079 1.433 1.115.587 2.36.892 1.268.329 2.63.329z",
		},
	},
	"Premiere Pro": {
		displayName: "Premiere Pro",
		logo: {
			viewBox: "0 0 128 128",
			path: "M50.3 38.5h-7.4v20.7h7.4c5 0 9.1-4.1 9.1-9.1v-2.4c0-5.1-4.1-9.2-9.1-9.2zM0 0v128h128V0H0zm51.2 67.5h-8.3v21.3h-9.6V30.3h18.5c9.4-.1 17.1 7.4 17.2 16.8v2.3c0 9.9-8 18-17.8 18.1zm46.1-14.2s-7 0-10.1 1.3v34.2H77.1V48.9s10.2-5.1 20.2-3.8v8.2z",
		},
	},
	// TODO: Reaper and Baselight aren't in simple-icons or devicon, add their logos from the vendors' press kits
	Reaper: { displayName: "Reaper", logo: null },
	Baselight: { displayName: "Baselight", logo: null },
};

export function hostInfo(hostName: string): HostInfo {
	return HOSTS[hostName] ?? { displayName: hostName, logo: null };
}
