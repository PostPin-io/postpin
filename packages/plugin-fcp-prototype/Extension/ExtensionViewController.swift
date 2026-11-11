import AppKit
import CoreMedia
import ProExtensionHost
import SwiftUI

// PROTOTYPE: workflow extension panel inside Final Cut Pro.
//
// SDK 1.0.3: extensions must not reference the FCPX proxy classes (no `as? FCPXProject`, no `.self`),
// only call methods on the objects FCP hands out. The container chain is read with selectors + objectType.

@objc(PostPinFCPLabViewController)
final class PostPinFCPLabViewController: NSViewController {
	private let model = LabModel(host: .workflowExtension)
	private var observer: TimelineObserver?

	override func loadView() {
		let root = LabRootView(
			model: model,
			extraTabs: [
				LabTab(id: "live", title: "0 · Live-Timeline", systemImage: "timeline.selection", content: AnyView(LiveView(model: model)))
			]
		)
		let hosting = NSHostingView(rootView: root)
		hosting.frame = NSRect(x: 0, y: 0, width: 900, height: 620)
		view = hosting
	}

	override func viewDidLoad() {
		super.viewDidLoad()
		guard let host = ProExtensionHostSingleton() as? FCPXHost else {
			model.write("ProExtensionHostSingleton() liefert keinen FCPXHost. Läuft die Extension in Final Cut?")
			return
		}
		model.write("Host: \(host.name) \(host.versionString) (\(host.bundleIdentifier))")
		let observer = TimelineObserver(host: host, model: model)
		self.observer = observer
		model.movePlayhead = { [weak observer] in observer?.move(to: $0) }
		model.live = LiveTimeline(host: "\(host.name) \(host.versionString)")
		if let timeline = host.timeline {
			timeline.add(observer)
			model.write("Timeline-Observer registriert")
		} else {
			model.write("host.timeline ist nil")
		}
		observer.refresh(reason: "Start")
	}

	deinit {
		if let observer, let host = ProExtensionHostSingleton() as? FCPXHost {
			host.timeline?.remove(observer)
		}
	}
}

@MainActor
final class TimelineObserver: NSObject, FCPXTimelineObserver {
	private let host: FCPXHost
	private let model: LabModel
	private var lastPlayheadLog = Date.distantPast
	private var lastSummary = ""
	private var repeats = 0

	init(host: FCPXHost, model: LabModel) {
		self.host = host
		self.model = model
	}

	nonisolated func activeSequenceChanged() {
		Task { @MainActor in self.refresh(reason: "activeSequenceChanged") }
	}

	nonisolated func playheadTimeChanged() {
		Task { @MainActor in self.updatePlayhead() }
	}

	nonisolated func sequenceTimeRangeChanged() {
		Task { @MainActor in self.refresh(reason: "sequenceTimeRangeChanged") }
	}

	func move(to time: RationalTime) {
		guard let timeline = host.timeline else { return }
		let result = timeline.movePlayhead(to: CMTime(value: time.num, timescale: CMTimeScale(clamping: time.den)))
		model.write("movePlayhead ← FCP meldet \(RationalTime(cm: result).fcpxml)")
	}

	func updatePlayhead() {
		guard let timeline = host.timeline, var live = model.live else { return }
		live.playhead = RationalTime(cm: timeline.playheadTime())
		live.updates += 1
		model.live = live
		if Date().timeIntervalSince(lastPlayheadLog) > 2 {
			lastPlayheadLog = Date()
			model.write("playheadTimeChanged → \(live.playhead.timecode(frameDuration: live.frameDuration)) (\(live.updates) Updates bisher)")
		}
	}

	func refresh(reason: String) {
		guard let timeline = host.timeline else {
			model.write("\(reason): keine Timeline")
			return
		}
		var live = model.live ?? LiveTimeline()
		live.rangeStart = RationalTime(cm: timeline.sequenceTimeRange.start)
		live.rangeDuration = RationalTime(cm: timeline.sequenceTimeRange.duration)
		live.playhead = RationalTime(cm: timeline.playheadTime())
		if let sequence = timeline.activeSequence {
			live.sequenceName = sequence.name
			live.startTime = RationalTime(cm: sequence.startTime)
			live.duration = RationalTime(cm: sequence.duration)
			live.frameDuration = RationalTime(cm: sequence.frameDuration)
			live.timecodeFormat =
				switch sequence.timecodeFormat {
				case .dropFrame: "DF"
				case .nonDropFrame: "NDF"
				default: "unspecified (\(sequence.timecodeFormat.rawValue))"
				}
			// sequence → project → event → library
			var container = sequence.container
			while let object = container {
				switch object.objectType {
				case .project:
					live.project = Self.string(object, "name")
					live.projectUID = Self.string(object, "UID")
				case .event:
					live.event = Self.string(object, "name")
					live.eventUID = Self.string(object, "UID")
				case .library:
					live.library = Self.string(object, "name")
					live.libraryURL = (Self.value(object, "url") as? URL)?.absoluteString ?? "–"
				default:
					break
				}
				container = object.container
			}
		} else {
			live.sequenceName = "– (keine aktive Sequenz)"
		}
		model.live = live
		let summary =
			"'\(live.sequenceName)' start \(live.startTime.fcpxml) dauer \(live.duration.fcpxml) frame \(live.frameDuration.fcpxml) \(live.timecodeFormat) · Projekt '\(live.project)' uid \(live.projectUID) · Event '\(live.event)' · Library '\(live.library)' \(live.libraryURL)"
		// FCP fires sequenceTimeRangeChanged in bursts (e.g. ~60× during an import): log changes only
		if summary == lastSummary {
			repeats += 1
			return
		}
		if repeats > 0 { model.write("  (\(repeats)× unverändert wiederholt)") }
		repeats = 0
		lastSummary = summary
		model.write("\(reason): \(summary)")
		if model.eventName.isEmpty, live.event != "–" { model.eventName = live.event }
	}

	private static func value(_ object: NSObject, _ key: String) -> Any? {
		let selector = NSSelectorFromString(key)
		guard object.responds(to: selector) else { return nil }
		return object.perform(selector)?.takeUnretainedValue()
	}

	private static func string(_ object: NSObject, _ key: String) -> String { value(object, key) as? String ?? "–" }
}

extension RationalTime {
	init(cm: CMTime) {
		self = cm.isValid && cm.timescale != 0 ? RationalTime(cm.value, Int64(cm.timescale)) : .zero
	}
}

struct LiveView: View {
	@ObservedObject var model: LabModel

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 12) {
				if let live = model.live {
					Text(live.playhead.timecode(frameDuration: live.frameDuration))
						.font(.system(size: 34, weight: .semibold, design: .monospaced))
					Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
						row("Host", live.host)
						row("Sequenz", live.sequenceName)
						row("Start / Dauer", "\(live.startTime.timecode(frameDuration: live.frameDuration)) / \(String(format: "%.2fs", live.duration.seconds))")
						row("Frame", "\(live.frameDuration.fcpxml) · \(live.timecodeFormat)")
						row("Range", "\(live.rangeStart.fcpxml) + \(live.rangeDuration.fcpxml)")
						row("Projekt", "\(live.project) · \(live.projectUID)")
						row("Event", "\(live.event) · \(live.eventUID)")
						row("Library", "\(live.library) · \(live.libraryURL)")
						row("Playhead-Updates", "\(live.updates)")
					}
					.font(.callout)
					.textSelection(.enabled)
					Text("Klick auf ▶︎ setzt den FCP-Playhead (movePlayhead). „+ am Playhead“ legt nur einen Kommentar in dieser Liste an: Marker in FCP kann die Live-API weder lesen noch schreiben, die kommen erst über Tab 2 (Marker-Clip / Projekt-Kopie) in die Timeline.")
						.font(.caption).foregroundStyle(.secondary)
					CommentsEditor(model: model)
				} else {
					Text("Kein FCPXHost. Die Live-Funktionen gehen nur, wenn das Panel in Final Cut läuft.")
				}
			}
			.padding()
			.frame(maxWidth: .infinity, alignment: .leading)
		}
	}

	private func row(_ key: String, _ value: String) -> some View {
		GridRow {
			Text(key).foregroundStyle(.secondary)
			Text(value)
		}
	}
}
