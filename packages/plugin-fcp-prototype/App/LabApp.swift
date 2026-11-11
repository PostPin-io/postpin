import SwiftUI

// PROTOTYPE: container app of the FCP lab. Hosts the workflow extension, receives share destination
// exports and runs the same drag & drop / Apple Event experiments as the extension, outside FCP.

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
	let model = LabModel(host: .app)
	lazy var share = ShareDestination(model: model)

	func applicationWillFinishLaunching(_ notification: Notification) {
		// before launch finishes, so the Apple Events FCP launched us with land in our handlers
		share.install()
	}

	func applicationDidFinishLaunching(_ notification: Notification) {
		// again, in case Cocoa Scripting (enabled by the sdef) registered its own handlers in between
		share.install()
		model.write("Share-Destination-Handler bereit (make/get/open)")
	}

	func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

@main
struct LabApp: App {
	@NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

	var body: some Scene {
		Window("PostPin FCP Lab", id: "lab") {
			LabRootView(
				model: delegate.model,
				trailingTabs: [
					LabTab(
						id: "share", title: "3 · Share Destination", systemImage: "square.and.arrow.up",
						content: AnyView(ShareView(share: delegate.share)))
				]
			)
		}
	}
}
