import AppKit
import SwiftUI

// PROTOTYPE: FCPXML drag & drop with plain AppKit, so every pasteboard type FCP offers or asks for is logged.

enum FCPPasteboard {
	static let generic = NSPasteboard.PasteboardType("com.apple.finalcutpro.xml")

	static func versioned(_ version: String) -> NSPasteboard.PasteboardType {
		NSPasteboard.PasteboardType("com.apple.finalcutpro.xml.v" + version.replacingOccurrences(of: ".", with: "-"))
	}

	/// newest first
	static let knownVersions = (5...14).reversed().map { "1.\($0)" }
	static let readTypes: [NSPasteboard.PasteboardType] = knownVersions.map(versioned) + [generic, .fileURL]
}

/// drop target for FCP projects/clips (pasteboard data) and .fcpxml / .fcpxmld files
final class FCPXMLDropNSView: NSView {
	var onDrop: ((Data, [String]) -> Void)?
	var onError: ((String) -> Void)?
	var isTargeted = false { didSet { needsDisplay = true } }

	override init(frame: NSRect) {
		super.init(frame: frame)
		registerForDraggedTypes(FCPPasteboard.readTypes)
	}

	required init?(coder: NSCoder) { fatalError() }

	override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
		isTargeted = true
		return .copy
	}

	override func draggingExited(_ sender: NSDraggingInfo?) { isTargeted = false }

	override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
		isTargeted = false
		let pb = sender.draggingPasteboard
		let types = (pb.types ?? []).map(\.rawValue)
		// the newest versioned type FCP offers, then the generic one
		let offered = Set(pb.types ?? [])
		for type in FCPPasteboard.readTypes where type != .fileURL && offered.contains(type) {
			if let data = pb.data(forType: type) {
				onDrop?(data, types + ["→ gelesen: \(type.rawValue)"])
				return true
			}
		}
		if let url = (pb.readObjects(forClasses: [NSURL.self]) as? [URL])?.first {
			let file = url.pathExtension == "fcpxmld" ? url.appending(path: "Info.fcpxml") : url
			if let data = try? Data(contentsOf: file) {
				onDrop?(data, types + ["→ gelesen: Datei \(file.lastPathComponent)"])
				return true
			}
		}
		onError?("Drop ohne FCPXML. Typen: \(types.joined(separator: ", "))")
		return false
	}

	override func draw(_ dirtyRect: NSRect) {
		let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 10, yRadius: 10)
		path.lineWidth = 2
		path.setLineDash([6, 4], count: 2, phase: 0)
		(isTargeted ? NSColor.controlAccentColor : NSColor.tertiaryLabelColor).setStroke()
		path.stroke()
		if isTargeted {
			NSColor.controlAccentColor.withAlphaComponent(0.1).setFill()
			path.fill()
		}
	}
}

struct FCPXMLDropZone<Label: View>: NSViewRepresentable {
	var onDrop: (Data, [String]) -> Void
	var onError: (String) -> Void
	@ViewBuilder var label: () -> Label

	func makeNSView(context: Context) -> FCPXMLDropNSView {
		let view = FCPXMLDropNSView()
		let host = NSHostingView(rootView: label())
		host.translatesAutoresizingMaskIntoConstraints = false
		view.addSubview(host)
		NSLayoutConstraint.activate([
			host.centerXAnchor.constraint(equalTo: view.centerXAnchor),
			host.centerYAnchor.constraint(equalTo: view.centerYAnchor),
		])
		return view
	}

	func updateNSView(_ view: FCPXMLDropNSView, context: Context) {
		view.onDrop = onDrop
		view.onError = onError
	}
}

/// how the drag source puts the FCPXML on the pasteboard
enum DragMode: String, CaseIterable, Identifiable {
	case lazy = "Daten auf Anfrage"
	case eager = "Daten sofort"
	case file = "Datei-URL (.fcpxml)"
	case both = "Daten + Datei-URL"
	var id: String { rawValue }
}

/// drag source that hands FCPXML to FCP, as pasteboard data and/or as a .fcpxml file like a Finder drag
final class FCPXMLDragNSView: NSView, NSDraggingSource, NSPasteboardItemDataProvider {
	var fcpxmlVersion = FCPXML.defaultVersion
	var mode = DragMode.lazy
	/// reason the drag cannot start (e.g. no project dropped yet), nil = ready
	var blocked: String?
	var makeData: (() -> Data?)?
	var writeFile: ((Data) -> URL?)?
	var onEvent: ((String) -> Void)?
	var title = "" { didSet { needsDisplay = true } }
	private var cached: Data?

	override func mouseDown(with event: NSEvent) {
		onEvent?("mouseDown auf dem Griff (Modus: \(mode.rawValue))")
		if let blocked {
			onEvent?("Drag nicht gestartet: \(blocked)")
			return
		}
		cached = nil
		let item = NSPasteboardItem()
		let dataTypes = [FCPPasteboard.versioned(fcpxmlVersion), FCPPasteboard.generic]
		var offered: [String] = []
		if mode != .lazy {
			cached = makeData?()
			guard let cached else {
				onEvent?("makeData liefert nichts (kein Projekt gezogen?) – Drag nicht gestartet")
				return
			}
			if mode != .file {
				for type in dataTypes { item.setData(cached, forType: type) }
				offered += dataTypes.map(\.rawValue)
			}
			if mode == .file || mode == .both {
				guard let url = writeFile?(cached) else {
					onEvent?("Datei schreiben fehlgeschlagen – Drag nicht gestartet")
					return
				}
				item.setString(url.absoluteString, forType: .fileURL)
				offered.append("public.file-url (\(url.path))")
			}
		} else {
			item.setDataProvider(self, forTypes: dataTypes)
			offered += dataTypes.map(\.rawValue)
		}
		let dragging = NSDraggingItem(pasteboardWriter: item)
		dragging.setDraggingFrame(bounds, contents: snapshot())
		onEvent?("Drag gestartet, angeboten: \(offered.joined(separator: ", "))")
		beginDraggingSession(with: [dragging], event: event, source: self)
	}

	func pasteboard(_ pasteboard: NSPasteboard?, item: NSPasteboardItem, provideDataForType type: NSPasteboard.PasteboardType) {
		if cached == nil { cached = makeData?() }
		onEvent?("Ziel fragt Daten an: \(type.rawValue) (\(cached?.count ?? 0) Bytes)")
		if let cached { item.setData(cached, forType: type) }
	}

	func draggingSession(_ session: NSDraggingSession, sourceOperationMaskFor context: NSDraggingContext) -> NSDragOperation {
		.copy
	}

	func draggingSession(_ session: NSDraggingSession, endedAt screenPoint: NSPoint, operation: NSDragOperation) {
		onEvent?(operation.isEmpty ? "Drag abgebrochen / nicht angenommen" : "Drag beendet: angenommen (operation \(operation.rawValue))")
	}

	private func snapshot() -> NSImage {
		let image = NSImage(size: bounds.size)
		if let rep = bitmapImageRepForCachingDisplay(in: bounds) {
			cacheDisplay(in: bounds, to: rep)
			image.addRepresentation(rep)
		}
		return image
	}

	override func draw(_ dirtyRect: NSRect) {
		let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 8, yRadius: 8)
		NSColor.controlAccentColor.withAlphaComponent(0.15).setFill()
		path.fill()
		NSColor.controlAccentColor.setStroke()
		path.stroke()
		let attrs: [NSAttributedString.Key: Any] = [
			.font: NSFont.systemFont(ofSize: 12, weight: .semibold), .foregroundColor: NSColor.labelColor,
		]
		let text = NSAttributedString(string: "⠿  " + title, attributes: attrs)
		let size = text.size()
		text.draw(at: NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2))
	}
}

struct FCPXMLDragHandle: NSViewRepresentable {
	var title: String
	var version: String
	var mode: DragMode
	var blocked: String? = nil
	var makeData: () -> Data?
	var writeFile: (Data) -> URL?
	var onEvent: (String) -> Void

	func makeNSView(context: Context) -> FCPXMLDragNSView { FCPXMLDragNSView() }

	func updateNSView(_ view: FCPXMLDragNSView, context: Context) {
		view.title = title
		view.fcpxmlVersion = version
		view.mode = mode
		view.blocked = blocked
		view.makeData = makeData
		view.writeFile = writeFile
		view.onEvent = onEvent
	}
}
