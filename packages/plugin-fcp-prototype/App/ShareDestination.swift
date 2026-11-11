import AppKit
import Carbon
import SwiftUI

// PROTOTYPE: receiving end of an FCP custom share destination (com.apple.proapps.MediaAssetProtocol).
// FCP talks to the app through Apple Events, in this order (Apple's "Final Cut Pro X Workflows" guide):
//   1. make new asset with properties {name, metadata, data options}  → object specifier of the asset
//   2. get location info of <asset>  → {folder, base name, has media, has description}
//   3. get metadata of <asset>       → user record, may add com.apple.proapps.share.id
//   4. get data options of <asset>   → {metadataSet: <one of availableMetadataSets>}
//   (newer FCP may also ask for library info)
//   5. open <exported files>         → object specifier of the asset
// Apple's sample does this with Cocoa Scripting. Here the raw events are handled directly so each one can be logged.

struct ShareAsset: Identifiable {
	let id: String
	var name: String
	var folder: URL
	var metadata: [(String, String)]
	var availableMetadataSets: [String]
	var files: [URL] = []
	let created = Date()
}

@MainActor
final class ShareDestination: NSObject, ObservableObject {
	@Published var assets: [ShareAsset] = []
	@Published var wantMedia = true
	@Published var wantDescription = true
	@Published var wantLibraryArchive = false
	@Published var wantLibraryDescription = false
	@Published var preferredMetadataSet = "General View"
	@Published var destinationReport: [String] = []

	let model: LabModel
	let root = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Movies/PostPin FCP Lab/Shares")

	init(model: LabModel) {
		self.model = model
		super.init()
	}

	func install() {
		let em = NSAppleEventManager.shared()
		em.setEventHandler(
			self, andSelector: #selector(handleMake(_:reply:)), forEventClass: AEEventClass(kAECoreSuite),
			andEventID: AEEventID(kAECreateElement))
		em.setEventHandler(
			self, andSelector: #selector(handleGet(_:reply:)), forEventClass: AEEventClass(kAECoreSuite),
			andEventID: AEEventID(kAEGetData))
		em.setEventHandler(
			self, andSelector: #selector(handleOpen(_:reply:)), forEventClass: AEEventClass(kCoreEventClass),
			andEventID: AEEventID(kAEOpenDocuments))
	}

	/// FCP keeps user destinations as a keyed archive; every "Export File" destination has a name and a
	/// jobAction XML whose defaultApp is the "Open with" app
	func inspectDestinations() {
		destinationReport = []
		let containers = ["com.apple.FinalCutApp", "com.apple.FinalCut", "com.apple.FinalCutTrial"]
		for c in containers {
			let dir = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Containers/\(c)/Data/Library/Preferences")
			for file in (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
			where file.lastPathComponent.hasPrefix("com.apple.FinalCut.UserDestinations") {
				guard let outer = NSDictionary(contentsOf: file), let data = outer["FFShareDestinationsKey"] as? Data,
					let archive = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
					let objects = archive["$objects"] as? [Any]
				else { continue }
				destinationReport.append("\(c)/\(file.lastPathComponent)")
				// NSKeyedArchiver UIDs only expose their index through the description
				func uid(_ v: Any?) -> Int? {
					guard let v, let r = "\(v)".range(of: #"value = (\d+)"#, options: .regularExpression) else { return nil }
					return Int("\(v)"[r].dropFirst(8))
				}
				func resolve(_ v: Any?) -> Any? { uid(v).flatMap { objects.indices.contains($0) ? objects[$0] : nil } }
				for case let dest as [String: Any] in objects where dest["setting"] != nil && dest["name"] != nil {
					let name = resolve(dest["name"]) as? String ?? "?"
					let type = resolve(dest["type"]) as? String ?? "?"
					// setting → action → jobAction → jobAction (xml string)
					var node: Any? = resolve(dest["setting"])
					for key in ["action", "jobAction", "jobAction"] { node = resolve((node as? [String: Any])?[key]) }
					guard let xml = node as? String else {
						destinationReport.append("  · \(name) [\(type)]")
						continue
					}
					// FCP 12 writes appName=, older versions defaultApp=
					let app = xml.range(of: #"(appName|defaultApp)="[^"]*""#, options: .regularExpression).map {
						let attr = String(xml[$0])
						let value = attr[attr.index(after: attr.firstIndex(of: "\"")!)...].dropLast()
						return String(value).removingPercentEncoding ?? ""
					}
					let helper = (resolve(dest["jobActionUsesHelperApp"]) as? Bool).map { $0 ? " · helperApp=ja" : " · helperApp=nein" } ?? ""
					let mark = app?.contains("PostPin FCP Lab") == true ? "✅" : "·"
					destinationReport.append("  \(mark) \(name) [\(type)]: öffnet mit \(app ?? "– (keine App)")\(helper)")
				}
			}
		}
		if destinationReport.isEmpty { destinationReport = ["keine FCP-Destinations gefunden"] }
		model.write("Destinations geprüft:\n" + destinationReport.joined(separator: "\n"))
	}

	// MARK: 1. make

	@objc private func handleMake(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
		let objectClass = event.paramDescriptor(forKeyword: AEKeyword(keyAEObjectClass))?.typeCodeValue ?? 0
		let props = event.paramDescriptor(forKeyword: AEKeyword(keyAEPropData))
		let name = props?.forKeyword(code("pnam"))?.stringValue ?? "Share"
		let metadata = Self.userRecord(props?.forKeyword(code("meta")))
		let options = Self.userRecord(props?.forKeyword(code("dopt")))
		model.write("Share ← make new \(fourCC(objectClass)) name='\(name)'")
		model.write("  metadata: \(metadata.map { "\($0.0)=\($0.1)" }.joined(separator: ", "))")
		model.write("  data options: \(options.map { "\($0.0)=\($0.1)" }.joined(separator: ", "))")

		let id = "pp-" + UUID().uuidString.prefix(8).lowercased()
		let stamp = Date().formatted(Date.ISO8601FormatStyle(timeZone: .current).year().month().day().time(includingFractionalSeconds: false).timeSeparator(.omitted))
		let folder = root.appending(path: "\(stamp) \(name.replacingOccurrences(of: "/", with: "-"))")
		try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
		let sets = options.first { $0.0 == "availableMetadataSets" }.map { $0.1.components(separatedBy: " | ") } ?? []
		assets.insert(
			ShareAsset(id: id, name: name, folder: folder, metadata: metadata.map { ($0.0, $0.1) }, availableMetadataSets: sets),
			at: 0)
		reply.setParam(Self.assetSpecifier(id), forKeyword: AEKeyword(keyDirectObject))
		model.write("Share → asset id \"\(id)\"")
	}

	// MARK: 2.–4. get

	@objc private func handleGet(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
		guard let spec = event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject)),
			let property = spec.forKeyword(AEKeyword(keyAEKeyData))?.typeCodeValue
		else {
			model.write("Share ← get ohne Property: \(event)")
			fail(reply, -1708)
			return
		}
		let assetID = spec.forKeyword(AEKeyword(keyAEContainer))?.forKeyword(AEKeyword(keyAEKeyData))?.stringValue
		guard let asset = assets.first(where: { $0.id == assetID }) else {
			model.write("Share ← get \(fourCC(property)) von unbekanntem Asset \(assetID ?? "–")")
			fail(reply, -1728)
			return
		}
		model.write("Share ← get \(fourCC(property)) of asset \(asset.id)")
		let result: NSAppleEventDescriptor
		switch fourCC(property) {
		case "locn":
			let r = NSAppleEventDescriptor.record()
			r.setDescriptor(NSAppleEventDescriptor(fileURL: asset.folder), forKeyword: code("asfd"))
			r.setDescriptor(NSAppleEventDescriptor(string: asset.name), forKeyword: code("asbn"))
			r.setDescriptor(NSAppleEventDescriptor(boolean: wantMedia), forKeyword: code("ashm"))
			r.setDescriptor(NSAppleEventDescriptor(boolean: wantDescription), forKeyword: code("ashd"))
			result = r
			model.write("Share → folder=\(asset.folder.path) media=\(wantMedia) description=\(wantDescription)")
		case "meta":
			var meta = asset.metadata
			meta.append(("com.apple.proapps.share.id", asset.id))
			meta.append(("com.apple.quicktime.description", "Shared to PostPin FCP Lab"))
			result = Self.userRecord(meta)
			model.write("Share → metadata + share.id=\(asset.id)")
		case "dopt":
			let set = asset.availableMetadataSets.contains(preferredMetadataSet) ? preferredMetadataSet : (asset.availableMetadataSets.first ?? preferredMetadataSet)
			result = Self.userRecord([("metadataSet", set)])
			model.write("Share → metadataSet=\(set)")
		case "lbry":
			let r = NSAppleEventDescriptor.record()
			r.setDescriptor(NSAppleEventDescriptor(fileURL: asset.folder), forKeyword: code("lbfd"))
			r.setDescriptor(NSAppleEventDescriptor(string: asset.name), forKeyword: code("lbbn"))
			r.setDescriptor(NSAppleEventDescriptor(boolean: wantLibraryArchive), forKeyword: code("lbha"))
			r.setDescriptor(NSAppleEventDescriptor(boolean: wantLibraryDescription), forKeyword: code("lbhd"))
			result = r
			model.write("Share → library archive=\(wantLibraryArchive) description=\(wantLibraryDescription)")
		case "pnam":
			result = NSAppleEventDescriptor(string: asset.name)
		case "ID  ":
			result = NSAppleEventDescriptor(string: asset.id)
		default:
			model.write("Share: unbekannte Property \(fourCC(property)), antworte mit Fehler")
			fail(reply, -1728)
			return
		}
		reply.setParam(result, forKeyword: AEKeyword(keyDirectObject))
	}

	// MARK: 5. open

	@objc private func handleOpen(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
		let urls = Self.fileURLs(event.paramDescriptor(forKeyword: AEKeyword(keyDirectObject)))
		model.write("Share/Open ← open \(urls.count) Datei(en): \(urls.map(\.lastPathComponent).joined(separator: ", "))")
		var matched: String?
		for url in urls {
			if let index = assets.firstIndex(where: {
				url.deletingLastPathComponent().standardizedFileURL.path == $0.folder.standardizedFileURL.path
					&& url.lastPathComponent.hasPrefix($0.name)
			}) {
				assets[index].files.append(url)
				matched = assets[index].id
			}
			let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
			model.write("  \(url.path) (\(ByteCountFormatter.string(fromByteCount: Int64(size), countStyle: .file)))")
			if ["fcpxml", "fcpxmld"].contains(url.pathExtension) {
				let file = url.pathExtension == "fcpxmld" ? url.appending(path: "Info.fcpxml") : url
				if let data = try? Data(contentsOf: file) { model.receive(data, types: ["Datei"], source: "Share-XML") }
			}
		}
		if let matched {
			reply.setParam(Self.assetSpecifier(matched), forKeyword: AEKeyword(keyDirectObject))
		} else if !urls.isEmpty {
			model.write("  (keinem Share-Asset zugeordnet: normales Öffnen, z. B. „Exportieren → Öffnen mit“)")
		}
	}

	// MARK: descriptors

	private func fail(_ reply: NSAppleEventDescriptor, _ code: Int32) {
		reply.setParam(NSAppleEventDescriptor(int32: code), forKeyword: AEKeyword(keyErrorNumber))
	}

	/// asset id "<id>" (no container: FCP only passes it back to us)
	static func assetSpecifier(_ id: String) -> NSAppleEventDescriptor {
		let r = NSAppleEventDescriptor.record()
		r.setDescriptor(NSAppleEventDescriptor(typeCode: code("aset")), forKeyword: AEKeyword(keyAEDesiredClass))
		r.setDescriptor(NSAppleEventDescriptor.null(), forKeyword: AEKeyword(keyAEContainer))
		r.setDescriptor(NSAppleEventDescriptor(enumCode: OSType(formUniqueID)), forKeyword: AEKeyword(keyAEKeyForm))
		r.setDescriptor(NSAppleEventDescriptor(string: id), forKeyword: AEKeyword(keyAEKeyData))
		return r.coerce(toDescriptorType: DescType(typeObjectSpecifier)) ?? r
	}

	/// AppleScript "user record" ({|key|: value}) as key/value strings; lists are joined with " | "
	static func userRecord(_ desc: NSAppleEventDescriptor?) -> [(String, String)] {
		guard let list = desc?.forKeyword(AEKeyword(keyASUserRecordFields)), list.numberOfItems >= 2 else { return [] }
		var out: [(String, String)] = []
		var i = 1
		while i < list.numberOfItems {
			let key = list.atIndex(i)?.stringValue ?? "?"
			let value = list.atIndex(i + 1)
			let text: String =
				if let value, value.descriptorType == DescType(typeAEList) {
					(1...max(value.numberOfItems, 1)).compactMap { value.atIndex($0)?.stringValue }.joined(separator: " | ")
				} else {
					value?.stringValue ?? "\(value.map { "\($0)" } ?? "nil")"
				}
			out.append((key, text))
			i += 2
		}
		return out
	}

	static func userRecord(_ pairs: [(String, String)]) -> NSAppleEventDescriptor {
		let list = NSAppleEventDescriptor.list()
		for (key, value) in pairs {
			list.insert(NSAppleEventDescriptor(string: key), at: 0)
			list.insert(NSAppleEventDescriptor(string: value), at: 0)
		}
		let r = NSAppleEventDescriptor.record()
		r.setDescriptor(list, forKeyword: AEKeyword(keyASUserRecordFields))
		return r
	}

	static func fileURLs(_ desc: NSAppleEventDescriptor?) -> [URL] {
		guard let desc else { return [] }
		if desc.descriptorType == DescType(typeAEList) {
			return (0..<desc.numberOfItems).compactMap { desc.atIndex($0 + 1)?.fileURLValue }
		}
		return desc.fileURLValue.map { [$0] } ?? []
	}
}

func code(_ s: String) -> FourCharCode { s.utf8.reduce(0) { $0 << 8 | FourCharCode($1) } }

func fourCC(_ c: FourCharCode) -> String {
	String(bytes: [24, 16, 8, 0].map { UInt8((c >> $0) & 0xFF) }, encoding: .macOSRoman) ?? "\(c)"
}

struct ShareView: View {
	@ObservedObject var share: ShareDestination

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 12) {
				GroupBox("Einrichten (einmalig in Final Cut)") {
					VStack(alignment: .leading, spacing: 4) {
						Text("1. Ablage › Teilen › Ziel hinzufügen… (oder Final Cut Pro › Einstellungen › Ziele)")
						Text("2. „Datei exportieren“ auf die Liste links ziehen, umbenennen in „PostPin Lab“")
						Text("3. Format/Codec wählen, dann **Öffnen mit › Andere… › ~/Applications/PostPin FCP Lab** (nicht QuickTime!)")
						Text("4. Projekt wählen › Ablage › Teilen › PostPin Lab. Kein Sichern-Dialog, wenn das Protokoll greift.")
						Text("Ziel: \(share.root.path)").foregroundStyle(.secondary).textSelection(.enabled)
					}
					.font(.callout)
					.frame(maxWidth: .infinity, alignment: .leading)
					.padding(4)
				}
				HStack {
					Button("FCP-Destinations prüfen") { share.inspectDestinations() }
					Text("liest Final Cuts Einstellungen: Mit welcher App öffnet jede Destination?").font(.caption).foregroundStyle(.secondary)
				}
				ForEach(share.destinationReport, id: \.self) { Text($0).font(.caption.monospaced()).textSelection(.enabled) }
				GroupBox("Antworten an FCP") {
					VStack(alignment: .leading) {
						Toggle("has media (gerenderter Film)", isOn: $share.wantMedia)
						Toggle("has description (FCPXML dazu)", isOn: $share.wantDescription)
						Toggle("library: has archive", isOn: $share.wantLibraryArchive)
						Toggle("library: has library description", isOn: $share.wantLibraryDescription)
						TextField("bevorzugtes metadataSet", text: $share.preferredMetadataSet).frame(width: 300)
					}
					.frame(maxWidth: .infinity, alignment: .leading)
					.padding(4)
				}
				Text("Empfangene Shares (\(share.assets.count))").font(.headline)
				ForEach(share.assets) { asset in
					VStack(alignment: .leading, spacing: 2) {
						HStack {
							Text(asset.name).bold()
							Text(asset.id).font(.caption.monospaced()).foregroundStyle(.secondary)
							Spacer()
							Button("Im Finder zeigen") { NSWorkspace.shared.activateFileViewerSelecting([asset.folder]) }
						}
						if asset.files.isEmpty {
							Text("wartet auf Export… (FCP rendert, danach kommt ein Open-Event)").font(.caption).foregroundStyle(.orange)
						}
						ForEach(asset.files, id: \.self) { Text($0.lastPathComponent).font(.caption.monospaced()) }
					}
					Divider()
				}
			}
			.padding()
		}
	}
}
