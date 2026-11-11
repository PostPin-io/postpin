import AppKit
import Foundation

// PROTOTYPE: state of the FCP lab, shared by the app window and the workflow extension.

struct LabComment: Identifiable, Hashable {
	var id = UUID()
	/// seconds after the sequence start
	var seconds: Double
	var author: String
	var text: String
	var kind: MarkerKind

	var tag: String { "[pp:\(id.uuidString.prefix(8).lowercased())]" }
}

struct LogLine: Identifiable {
	let id = UUID()
	let date = Date()
	let text: String
}

/// live data from the workflow extension's FCPXTimeline proxy
struct LiveTimeline {
	var host = ""
	var sequenceName = "–"
	var startTime = RationalTime.zero
	var duration = RationalTime.zero
	var frameDuration = RationalTime(1, 25)
	var timecodeFormat = "–"
	var playhead = RationalTime.zero
	var rangeStart = RationalTime.zero
	var rangeDuration = RationalTime.zero
	var project = "–"
	var projectUID = "–"
	var event = "–"
	var eventUID = "–"
	var library = "–"
	var libraryURL = "–"
	var updates = 0
}

@MainActor
final class LabModel: ObservableObject {
	enum Host: String { case app = "App", workflowExtension = "Workflow Extension" }

	let host: Host
	@Published var log: [LogLine] = []
	@Published var parsed: ParsedFCPXML?
	@Published var selectedProjectIndex = 0
	@Published var lastDropTypes: [String] = []
	@Published var rawXML = ""
	@Published var comments: [LabComment] = LabModel.sampleComments
	@Published var version = FCPXML.defaultVersion
	@Published var dragMode = DragMode.lazy

	@Published var keepName = false
	@Published var keepUID = false
	@Published var eventName = ""
	@Published var useLibraryLocation = true
	@Published var suppressWarnings = false
	@Published var lastPlacement: FCPXML.ProjectCopyResult?

	@Published var live: LiveTimeline?
	/// set by the workflow extension
	var movePlayhead: ((RationalTime) -> Void)?
	var onCommentsChanged: (() -> Void)?

	init(host: Host) {
		self.host = host
		write("PostPin FCP Lab gestartet (\(host.rawValue))")
	}

	static let sampleComments: [LabComment] = [
		LabComment(seconds: 1.5, author: "Anna (Kundin)", text: "Logo bitte größer", kind: .todo),
		LabComment(seconds: 4, author: "Ben", text: "Farbe hier etwas wärmer?", kind: .standard),
		LabComment(seconds: 8.2, author: "Anna (Kundin)", text: "Musik zu laut", kind: .todo),
		LabComment(seconds: 12, author: "Ben", text: "Super Schnitt 👍", kind: .done),
		LabComment(seconds: 20, author: "PostPin", text: "Kapitel: Abspann", kind: .chapter),
	]

	var project: ParsedProject? {
		guard let parsed, parsed.projects.indices.contains(selectedProjectIndex) else { return nil }
		return parsed.projects[selectedProjectIndex]
	}

	func write(_ text: String) {
		log.append(LogLine(text: text))
		NSLog("[FCPLab] %@", text)
	}

	// MARK: FCP → PostPin

	func receive(_ data: Data, types: [String], source: String) {
		lastDropTypes = types
		rawXML = String(decoding: data.prefix(400_000), as: UTF8.self)
		do {
			let p = try FCPXML.parse(data)
			parsed = p
			selectedProjectIndex = 0
			write(
				"\(source): FCPXML \(p.version), \(data.count) Bytes, \(p.projects.count) Projekt(e), \(p.clipCount) Clip(s)"
			)
			for project in p.projects {
				write(
					"  Projekt '\(project.name)' uid=\(project.uid ?? "–") event=\(project.eventName ?? "–") markers=\(project.markers.count) items=\(project.items.count)"
				)
			}
			if let project = p.projects.first, eventName.isEmpty, let e = project.eventName { eventName = e }
			// a copy labelled with an older version than its content is silently rejected by FCP on drop
			if p.version != version, FCPXML.versions.contains(p.version) {
				write("  FCPXML-Version → \(p.version) (wie die Quelle; ältere Nummer lehnt FCP beim Drop ab)")
				version = p.version
			}
		} catch {
			parsed = nil
			write("\(source): Fehler beim Parsen: \(error.localizedDescription)")
		}
	}

	func commentsFromMarkers() {
		guard let project else { return }
		comments = project.markers.map {
			LabComment(seconds: ($0.time - project.tcStart).seconds, author: "FCP", text: $0.name, kind: $0.kind)
		}
		write("\(comments.count) Kommentare aus den Markern des Projekts übernommen")
		onCommentsChanged?()
	}

	// MARK: PostPin → FCP

	/// sequence start and frame duration: dropped project first, then the live timeline
	var timebase: (start: RationalTime, frameDuration: RationalTime) {
		if let project { return (project.tcStart, project.frameDuration) }
		if let live { return (live.startTime, live.frameDuration) }
		return (.zero, RationalTime(1, 25))
	}

	var markerInputs: [FCPXML.MarkerInput] {
		let (start, fd) = timebase
		return comments.map {
			FCPXML.MarkerInput(
				time: start + RationalTime(seconds: $0.seconds, frameDuration: fd),
				name: $0.text,
				note: "\($0.author) · \($0.tag)",
				kind: $0.kind
			)
		}
	}

	func markerClipData() -> Data {
		let data = FCPXML.markerClip(
			markers: markerInputs, project: project, version: version, eventName: eventName.isEmpty ? nil : eventName)
		write("Marker-Clip erzeugt (\(comments.count) Marker, FCPXML \(version), \(data.count) Bytes)")
		return data
	}

	var copyName: String {
		guard let project else { return "" }
		return keepName ? project.name : "\(project.name) (PostPin)"
	}

	func projectCopyData() -> Data? {
		guard let parsed, let project else {
			write("Projekt-Kopie: zuerst ein Projekt aus FCP in den Rein-Tab ziehen")
			return nil
		}
		do {
			let result = try FCPXML.projectCopy(
				source: parsed,
				project: project,
				markers: markerInputs,
				version: version,
				newName: copyName,
				keepUID: keepUID,
				eventName: eventName.isEmpty ? nil : eventName,
				libraryLocation: useLibraryLocation ? (parsed.libraryLocation ?? liveLibraryLocation) : nil,
				importOptions: ["suppress warnings": suppressWarnings ? "1" : ""]
			)
			lastPlacement = result
			write(
				"Projekt-Kopie '\(copyName)' erzeugt: \(result.placed.count) Marker gesetzt, \(result.skipped.count) übersprungen, uid \(keepUID ? "behalten" : "entfernt")"
			)
			return result.data
		} catch {
			write("Projekt-Kopie fehlgeschlagen: \(error.localizedDescription)")
			return nil
		}
	}

	private var liveLibraryLocation: String? {
		guard let url = live?.libraryURL, url.hasPrefix("file:") else { return nil }
		return url
	}

	static let fcpBundleIDs = ["com.apple.FinalCut", "com.apple.FinalCutApp", "com.apple.FinalCutTrial"]

	/// Open Document Apple Event with an .fcpxml file, which is how FCP imports programmatically
	func importIntoFCP(_ data: Data?, name: String) {
		guard let data else { return }
		guard let fcp = Self.fcpBundleIDs.lazy.compactMap({ NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0) }).first
		else {
			write("Final Cut Pro nicht gefunden (\(Self.fcpBundleIDs.joined(separator: ", ")))")
			return
		}
		do {
			let url = try writeOutput(data, name: name)
			let config = NSWorkspace.OpenConfiguration()
			config.activates = true
			write("Sende Open-Document an \(fcp.lastPathComponent): \(url.path)")
			NSWorkspace.shared.open([url], withApplicationAt: fcp, configuration: config) { _, error in
				Task { @MainActor in
					self.write(error.map { "Open-Document fehlgeschlagen: \($0.localizedDescription)" } ?? "Open-Document gesendet")
				}
			}
		} catch {
			write("Konnte Datei nicht schreiben: \(error.localizedDescription)")
		}
	}

	func save(_ data: Data?, name: String) {
		guard let data else { return }
		let panel = NSSavePanel()
		panel.nameFieldStringValue = "\(name).fcpxml"
		panel.begin { response in
			guard response == .OK, let url = panel.url else { return }
			Task { @MainActor in
				do {
					try data.write(to: url)
					self.write("Gespeichert: \(url.path)")
				} catch {
					self.write("Speichern fehlgeschlagen: \(error.localizedDescription)")
				}
			}
		}
	}

	/// file for a file-URL drag; logs instead of throwing
	func dragFile(_ data: Data, name: String) -> URL? {
		do {
			let url = try writeOutput(data, name: name)
			write("Drag-Datei geschrieben: \(url.path)")
			return url
		} catch {
			write("Drag-Datei schreiben fehlgeschlagen: \(error.localizedDescription)")
			return nil
		}
	}

	func writeOutput(_ data: Data, name: String) throws -> URL {
		let dir: URL =
			host == .app
			? FileManager.default.homeDirectoryForCurrentUser.appending(path: "Movies/PostPin FCP Lab/out")
			: FileManager.default.temporaryDirectory.appending(path: "out")
		try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
		let safe = name.replacingOccurrences(of: "/", with: "-")
		let url = dir.appending(path: "\(safe).fcpxml")
		try data.write(to: url)
		return url
	}

	// MARK: live timeline (workflow extension)

	func jump(to comment: LabComment) {
		guard let movePlayhead else { return }
		let (start, fd) = live.map { ($0.startTime, $0.frameDuration) } ?? timebase
		let target = start + RationalTime(seconds: comment.seconds, frameDuration: fd)
		write("movePlayhead → \(target.timecode(frameDuration: fd)) (\(comment.text))")
		movePlayhead(target)
	}

	func addCommentAtPlayhead() {
		guard let live else { return }
		let seconds = (live.playhead - live.startTime).seconds
		comments.append(LabComment(seconds: seconds, author: "Ich", text: "Neuer Kommentar", kind: .standard))
		comments.sort { $0.seconds < $1.seconds }
		write("Kommentar am Playhead \(live.playhead.timecode(frameDuration: live.frameDuration)) angelegt")
		onCommentsChanged?()
	}
}
