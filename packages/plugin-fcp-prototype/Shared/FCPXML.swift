import Foundation

// PROTOTYPE: FCPXML reading and writing for the FCP lab. Throwaway, see README.md.

enum MarkerKind: String, CaseIterable, Identifiable {
	case standard, todo, done, chapter
	var id: String { rawValue }

	var label: String {
		switch self {
		case .standard: "Standard (blau)"
		case .todo: "To-do (rot)"
		case .done: "Erledigt (grün)"
		case .chapter: "Kapitel (orange)"
		}
	}
}

struct TimelineMarker: Identifiable, Hashable {
	let id = UUID()
	/// absolute sequence time (includes the sequence tcStart, like NleMarker.frame)
	var time: RationalTime
	var duration: RationalTime?
	var name: String
	var note: String
	var kind: MarkerKind
	/// element the marker hangs on, e.g. "asset-clip 'Interview'"
	var owner: String
}

struct StoryItem: Identifiable, Hashable {
	let id = UUID()
	var depth: Int
	var kind: String
	var name: String
	var offset: RationalTime
	var duration: RationalTime
	var lane: String?
}

struct SequenceFormat: Hashable {
	var id: String
	var name: String?
	var frameDuration: RationalTime
	var width: String?
	var height: String?
}

struct ParsedProject: Identifiable {
	let id = UUID()
	var name: String
	var uid: String?
	var modDate: String?
	var eventName: String?
	var format: SequenceFormat?
	var tcStart: RationalTime
	var duration: RationalTime
	var tcFormat: String?
	var markers: [TimelineMarker]
	var items: [StoryItem]

	var frameDuration: RationalTime { format?.frameDuration ?? RationalTime(1, 25) }
}

struct ParsedFCPXML {
	var version: String
	var libraryLocation: String?
	var projects: [ParsedProject]
	var clipCount: Int
	var document: XMLDocument
	var byteCount: Int
}

enum FCPXMLError: LocalizedError {
	case notFCPXML
	case noProject

	var errorDescription: String? {
		switch self {
		case .notFCPXML: "Kein FCPXML (Root-Element ist nicht <fcpxml>)"
		case .noProject: "Das FCPXML enthält kein Projekt. Bitte ein Projekt (nicht nur Clips) ziehen."
		}
	}
}

enum FCPXML {
	static let defaultVersion = "1.11"
	static let versions = ["1.10", "1.11", "1.12", "1.13", "1.14"]

	static let storyElements: Set<String> = [
		"asset-clip", "clip", "ref-clip", "sync-clip", "mc-clip", "audition", "gap", "title", "video", "audio",
		"live-drawing", "spine", "transition", "caption",
	]

	/// marker_item must come before these in every clip element (FCPXML DTD 1.12)
	private static let afterMarkers: Set<String> = [
		"audio-channel-source", "audio-role-source", "sync-source", "filter-video", "filter-video-mask", "filter-audio",
		"metadata", "reserved",
	]

	// MARK: reading

	static func parse(_ data: Data) throws -> ParsedFCPXML {
		let doc = try XMLDocument(data: data, options: [.nodePreserveWhitespace])
		guard let root = doc.rootElement(), root.name == "fcpxml" else { throw FCPXMLError.notFCPXML }
		var formats: [String: SequenceFormat] = [:]
		for f in (try? root.nodes(forXPath: "resources/format")) as? [XMLElement] ?? [] {
			guard let id = f.attr("id") else { continue }
			formats[id] = SequenceFormat(
				id: id,
				name: f.attr("name"),
				frameDuration: RationalTime(fcpxml: f.attr("frameDuration")) ?? RationalTime(1, 25),
				width: f.attr("width"),
				height: f.attr("height")
			)
		}
		let projects = ((try? root.nodes(forXPath: "//project")) as? [XMLElement] ?? []).compactMap { project -> ParsedProject? in
			guard let sequence = project.child("sequence") else { return nil }
			let markers = ((try? sequence.nodes(forXPath: ".//marker | .//chapter-marker")) as? [XMLElement] ?? []).map {
				readMarker($0)
			}
			var items: [StoryItem] = []
			if let spine = sequence.child("spine") { collectItems(spine, depth: 0, into: &items) }
			let event = (project.parent as? XMLElement).flatMap { $0.name == "event" ? $0.attr("name") : nil }
			return ParsedProject(
				name: project.attr("name") ?? "(ohne Name)",
				uid: project.attr("uid"),
				modDate: project.attr("modDate"),
				eventName: event,
				format: sequence.attr("format").flatMap { formats[$0] },
				tcStart: time(sequence, "tcStart"),
				duration: time(sequence, "duration"),
				tcFormat: sequence.attr("tcFormat"),
				markers: markers.sorted { $0.time < $1.time },
				items: items
			)
		}
		let clips = ((try? root.nodes(forXPath: "//event/*[not(self::project)] | /fcpxml/*[not(self::resources) and not(self::project) and not(self::event) and not(self::library) and not(self::import-options)]")) ?? []).count
		return ParsedFCPXML(
			version: root.attr("version") ?? "?",
			libraryLocation: root.child("library")?.attr("location"),
			projects: projects,
			clipCount: clips,
			document: doc,
			byteCount: data.count
		)
	}

	private static func readMarker(_ m: XMLElement) -> TimelineMarker {
		let parent = m.parent as? XMLElement
		let kind: MarkerKind =
			if m.name == "chapter-marker" { .chapter }
			else if let c = m.attr("completed") { c == "1" ? .done : .todo }
			else { .standard }
		return TimelineMarker(
			time: parent.map { sequenceTime(time(m, "start"), in: $0) } ?? time(m, "start"),
			duration: RationalTime(fcpxml: m.attr("duration")),
			name: m.attr("value") ?? "",
			note: m.attr("note") ?? "",
			kind: kind,
			owner: parent.map(describe) ?? "?"
		)
	}

	private static func collectItems(_ container: XMLElement, depth: Int, into items: inout [StoryItem]) {
		for child in container.elementChildren where storyElements.contains(child.name ?? "") {
			if child.name == "spine" {
				collectItems(child, depth: depth + 1, into: &items)
				continue
			}
			items.append(
				StoryItem(
					depth: depth,
					kind: child.name ?? "?",
					name: child.attr("name") ?? "",
					offset: sequenceTime(time(child, "offset"), in: container),
					duration: time(child, "duration"),
					lane: child.attr("lane")
				))
			collectItems(child, depth: depth + 1, into: &items)
		}
	}

	/// Converts a time local to `element` into sequence time: every element maps its local time to its
	/// parent with `offset + (t - start)`, up to the <sequence>.
	static func sequenceTime(_ local: RationalTime, in element: XMLElement) -> RationalTime {
		var t = local
		var e: XMLElement? = element
		while let current = e, current.name != "sequence" {
			t = time(current, "offset") + (t - time(current, "start"))
			e = current.parent as? XMLElement
		}
		return t
	}

	static func time(_ e: XMLElement, _ attr: String) -> RationalTime { RationalTime(fcpxml: e.attr(attr)) ?? .zero }

	static func describe(_ e: XMLElement) -> String {
		let name = e.attr("name").map { " '\($0)'" } ?? ""
		return "\(e.name ?? "?")\(name)"
	}

	// MARK: writing

	struct MarkerInput {
		var time: RationalTime
		var name: String
		var note: String
		var kind: MarkerKind
	}

	static func markerElement(_ m: MarkerInput, start: RationalTime, frameDuration: RationalTime) -> XMLElement {
		let e = XMLElement(name: m.kind == .chapter ? "chapter-marker" : "marker")
		e.setAttr("start", start.fcpxml)
		e.setAttr("duration", frameDuration.fcpxml)
		e.setAttr("value", m.name)
		if !m.note.isEmpty { e.setAttr("note", m.note) }
		switch m.kind {
		case .todo: e.setAttr("completed", "0")
		case .done: e.setAttr("completed", "1")
		case .chapter: e.setAttr("posterOffset", "0s")
		case .standard: break
		}
		return e
	}

	/// inserts a marker where the DTD allows it: after anchored items and other markers, before filters/metadata
	static func insertMarker(_ marker: XMLElement, into owner: XMLElement) {
		let children = owner.elementChildren
		if let firstAfter = children.first(where: { afterMarkers.contains($0.name ?? "") }) {
			owner.insertChild(marker, at: firstAfter.index)
		} else {
			owner.addChild(marker)
		}
	}

	/// Variant A: one compound clip whose markers line up with the timeline when it is placed at the
	/// sequence start. Markers stay on that clip, the real project is untouched.
	static func markerClip(
		markers: [MarkerInput],
		project: ParsedProject?,
		version: String,
		eventName: String?
	) -> Data {
		let fd = project?.frameDuration ?? RationalTime(1, 25)
		let tcStart = project?.tcStart ?? .zero
		let lastMarker = markers.map(\.time).max() ?? tcStart
		let minEnd = lastMarker + fd * Int64((1 / fd.seconds).rounded() * 5)
		let projectEnd = project.map { $0.tcStart + $0.duration } ?? .zero
		let end = max(minEnd, projectEnd)
		let duration = (end - tcStart).floored(to: fd)

		let root = XMLElement(name: "fcpxml")
		root.setAttr("version", version)
		let resources = XMLElement(name: "resources")
		let format = XMLElement(name: "format")
		format.setAttr("id", "r1")
		if let f = project?.format {
			if let name = f.name { format.setAttr("name", name) }
			format.setAttr("frameDuration", f.frameDuration.fcpxml)
			if let w = f.width { format.setAttr("width", w) }
			if let h = f.height { format.setAttr("height", h) }
		} else {
			format.setAttr("name", "FFVideoFormat1080p25")
			format.setAttr("frameDuration", "1/25s")
			format.setAttr("width", "1920")
			format.setAttr("height", "1080")
		}
		resources.addChild(format)
		root.addChild(resources)

		let clip = XMLElement(name: "clip")
		clip.setAttr("name", "PostPin Marker")
		clip.setAttr("start", tcStart.fcpxml)
		clip.setAttr("duration", duration.fcpxml)
		clip.setAttr("format", "r1")
		clip.setAttr("tcFormat", project?.tcFormat ?? "NDF")
		let gap = XMLElement(name: "gap")
		gap.setAttr("name", "PostPin")
		gap.setAttr("offset", tcStart.fcpxml)
		gap.setAttr("start", tcStart.fcpxml)
		gap.setAttr("duration", duration.fcpxml)
		clip.addChild(gap)
		for m in markers.sorted(by: { $0.time < $1.time }) where m.time >= tcStart && m.time < tcStart + duration {
			insertMarker(markerElement(m, start: m.time.floored(to: fd), frameDuration: fd), into: clip)
		}

		if let eventName, !eventName.isEmpty {
			let event = XMLElement(name: "event")
			event.setAttr("name", eventName)
			event.addChild(clip)
			root.addChild(event)
		} else {
			root.addChild(clip)
		}
		return serialize(root)
	}

	struct ProjectCopyResult {
		var data: Data
		var placed: [String]
		var skipped: [String]
	}

	/// Variant B: the dropped project with markers added to the primary storyline clips, re-imported as a
	/// project. Keeping name and uid tests whether FCP offers to replace the original project.
	static func projectCopy(
		source: ParsedFCPXML,
		project: ParsedProject,
		markers: [MarkerInput],
		version: String,
		newName: String,
		keepUID: Bool,
		eventName: String?,
		libraryLocation: String?,
		importOptions: [String: String]
	) throws -> ProjectCopyResult {
		guard let src = source.document.copy() as? XMLDocument, let srcRoot = src.rootElement() else {
			throw FCPXMLError.notFCPXML
		}
		let projects = (try? srcRoot.nodes(forXPath: "//project")) as? [XMLElement] ?? []
		guard let projectEl = projects.first(where: { $0.attr("name") == project.name }) ?? projects.first,
			let sequence = projectEl.child("sequence"), let spine = sequence.child("spine")
		else { throw FCPXMLError.noProject }

		let fd = project.frameDuration
		var placed: [String] = []
		var skipped: [String] = []
		let primary = spine.elementChildren.filter { ($0.name ?? "") != "transition" && storyElements.contains($0.name ?? "") }
		for m in markers.sorted(by: { $0.time < $1.time }) {
			let t = m.time.floored(to: fd)
			guard
				let owner = primary.first(where: {
					let o = time($0, "offset")
					return o <= t && t < o + time($0, "duration")
				})
			else {
				skipped.append("\(t.timecode(frameDuration: fd)) \(m.name): kein Clip in der Primary Storyline")
				continue
			}
			let local = time(owner, "start") + (t - time(owner, "offset"))
			insertMarker(markerElement(m, start: local, frameDuration: fd), into: owner)
			placed.append("\(t.timecode(frameDuration: fd)) \(m.name) → \(describe(owner)) @ \(local.fcpxml)")
		}

		projectEl.detach()
		projectEl.setAttr("name", newName)
		if !keepUID { projectEl.removeAttribute(forName: "uid") }
		projectEl.removeAttribute(forName: "id")

		let root = XMLElement(name: "fcpxml")
		root.setAttr("version", version)
		let options = importOptions.filter { !$0.value.isEmpty }
		if !options.isEmpty || libraryLocation?.isEmpty == false {
			let io = XMLElement(name: "import-options")
			var all = options
			if let libraryLocation, !libraryLocation.isEmpty { all["library location"] = libraryLocation }
			for (key, value) in all.sorted(by: { $0.key < $1.key }) {
				let o = XMLElement(name: "option")
				o.setAttr("key", key)
				o.setAttr("value", value)
				io.addChild(o)
			}
			root.addChild(io)
		}
		if let resources = srcRoot.child("resources") {
			resources.detach()
			root.addChild(resources)
		}
		if let eventName, !eventName.isEmpty {
			let event = XMLElement(name: "event")
			event.setAttr("name", eventName)
			event.addChild(projectEl)
			root.addChild(event)
		} else {
			root.addChild(projectEl)
		}
		return ProjectCopyResult(data: serialize(root, pretty: false), placed: placed, skipped: skipped)
	}

	/// pretty printing would double the whitespace nodes that parse() preserves (title text needs them)
	static func serialize(_ root: XMLElement, pretty: Bool = true) -> Data {
		let doc = XMLDocument(rootElement: root)
		doc.version = "1.0"
		doc.characterEncoding = "UTF-8"
		doc.isStandalone = false
		let dtd = XMLDTD()
		dtd.name = "fcpxml"
		doc.dtd = dtd
		return doc.xmlData(options: pretty ? [.nodePrettyPrint, .nodeCompactEmptyElement] : [.nodeCompactEmptyElement])
	}
}

extension XMLElement {
	func attr(_ name: String) -> String? { attribute(forName: name)?.stringValue }

	func setAttr(_ name: String, _ value: String) {
		if let a = attribute(forName: name) {
			a.stringValue = value
		} else {
			addAttribute(XMLNode.attribute(withName: name, stringValue: value) as! XMLNode)
		}
	}

	func child(_ name: String) -> XMLElement? { elements(forName: name).first }

	var elementChildren: [XMLElement] { (children ?? []).compactMap { $0 as? XMLElement } }
}
