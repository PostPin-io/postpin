import SwiftUI

// PROTOTYPE: lab UI shared by the app window and the workflow extension.

struct LabTab: Identifiable {
	let id: String
	let title: String
	let systemImage: String
	let content: AnyView
}

struct LabRootView: View {
	@ObservedObject var model: LabModel
	var extraTabs: [LabTab] = []
	var trailingTabs: [LabTab] = []

	var body: some View {
		TabView {
			ForEach(extraTabs) { tab in
				tab.content.tabItem { Label(tab.title, systemImage: tab.systemImage) }
			}
			InboundView(model: model).tabItem { Label("1 · Rein (FCP → PostPin)", systemImage: "arrow.down.doc") }
			OutboundView(model: model).tabItem { Label("2 · Raus (PostPin → FCP)", systemImage: "arrow.up.doc") }
			ForEach(trailingTabs) { tab in
				tab.content.tabItem { Label(tab.title, systemImage: tab.systemImage) }
			}
			WebBridgeView(model: model).tabItem { Label("WebView", systemImage: "globe") }
			LogView(model: model).tabItem { Label("Log (\(model.log.count))", systemImage: "list.bullet.rectangle") }
		}
		.padding(8)
		.frame(minWidth: 640, minHeight: 480)
	}
}

// MARK: inbound

struct InboundView: View {
	@ObservedObject var model: LabModel

	var body: some View {
		VStack(alignment: .leading, spacing: 10) {
			FCPXMLDropZone(
				onDrop: { model.receive($0, types: $1, source: "Drop") },
				onError: { model.write($0) }
			) {
				VStack(spacing: 4) {
					Text("Projekt aus Final Cut hierher ziehen").font(.headline)
					Text("aus dem Browser oder die Timeline-Auswahl · auch .fcpxml/.fcpxmld-Dateien")
						.font(.caption).foregroundStyle(.secondary)
				}
			}
			.frame(height: 90)

			if let parsed = model.parsed {
				ScrollView {
					VStack(alignment: .leading, spacing: 12) {
						Text("FCPXML \(parsed.version) · \(parsed.byteCount) Bytes · Library: \(parsed.libraryLocation ?? "– (nicht enthalten)")")
							.font(.caption).textSelection(.enabled)
						if parsed.projects.count > 1 {
							Picker("Projekt", selection: $model.selectedProjectIndex) {
								ForEach(parsed.projects.indices, id: \.self) { Text(parsed.projects[$0].name).tag($0) }
							}
						}
						if let project = model.project {
							ProjectSummary(project: project)
							HStack {
								Text("Marker (\(project.markers.count))").font(.headline)
								Spacer()
								Button("Als Kommentare übernehmen") { model.commentsFromMarkers() }
							}
							MarkerTable(project: project)
							Text("Timeline-Struktur (\(project.items.count))").font(.headline)
							ForEach(project.items) { item in
								HStack {
									Text(String(repeating: "   ", count: item.depth) + item.kind).monospaced()
									Text(item.name)
									Spacer()
									Text(item.lane.map { "lane \($0)" } ?? "").foregroundStyle(.secondary)
									Text(item.offset.timecode(frameDuration: project.frameDuration)).monospaced()
									Text(String(format: "%.2fs", item.duration.seconds)).monospaced().foregroundStyle(.secondary)
								}
								.font(.caption)
							}
						} else {
							Text("Kein Projekt enthalten (\(parsed.clipCount) Clips). Für Marker ein Projekt ziehen.")
								.foregroundStyle(.orange)
						}
						DisclosureGroup("Pasteboard-Typen (\(model.lastDropTypes.count))") {
							Text(model.lastDropTypes.joined(separator: "\n")).font(.caption.monospaced()).textSelection(.enabled)
						}
						DisclosureGroup("Roh-XML") {
							Text(model.rawXML).font(.caption2.monospaced()).textSelection(.enabled)
						}
					}
					.frame(maxWidth: .infinity, alignment: .leading)
				}
			} else {
				Spacer()
			}
		}
		.padding()
	}
}

struct ProjectSummary: View {
	let project: ParsedProject

	var body: some View {
		Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 4) {
			row("Projekt", project.name)
			row("UID", project.uid ?? "–")
			row("Event", project.eventName ?? "– (nicht enthalten)")
			row("Format", "\(project.format?.name ?? "?") \(project.format?.width ?? "?")×\(project.format?.height ?? "?")")
			row("Frame", "\(project.frameDuration.fcpxml) ≈ \(String(format: "%.3f", 1 / project.frameDuration.seconds)) fps")
			row("Start", "\(project.tcStart.timecode(frameDuration: project.frameDuration)) (\(project.tcFormat ?? "?"))")
			row("Dauer", String(format: "%.2fs", project.duration.seconds))
			row("modDate", project.modDate ?? "–")
		}
		.font(.callout)
		.textSelection(.enabled)
	}

	private func row(_ key: String, _ value: String) -> some View {
		GridRow {
			Text(key).foregroundStyle(.secondary)
			Text(value)
		}
	}
}

struct MarkerTable: View {
	let project: ParsedProject

	var body: some View {
		ForEach(project.markers) { m in
			HStack(alignment: .top) {
				Circle().fill(m.kind.color).frame(width: 8, height: 8).padding(.top, 4)
				Text(m.time.timecode(frameDuration: project.frameDuration)).monospaced()
				VStack(alignment: .leading) {
					Text(m.name)
					if !m.note.isEmpty { Text(m.note).foregroundStyle(.secondary) }
				}
				Spacer()
				Text(m.owner).foregroundStyle(.secondary)
			}
			.font(.caption)
		}
	}
}

extension MarkerKind {
	var color: Color {
		switch self {
		case .standard: .blue
		case .todo: .red
		case .done: .green
		case .chapter: .orange
		}
	}
}

// MARK: outbound

struct OutboundView: View {
	@ObservedObject var model: LabModel

	var body: some View {
		ScrollView {
			VStack(alignment: .leading, spacing: 14) {
				CommentsEditor(model: model)

				HStack {
					Picker("FCPXML-Version", selection: $model.version) {
						ForEach(FCPXML.versions, id: \.self) { Text($0).tag($0) }
					}
					.frame(width: 220)
					Picker("Drag", selection: $model.dragMode) {
						ForEach(DragMode.allCases) { Text($0.rawValue).tag($0) }
					}
					.frame(width: 240)
					TextField("Ziel-Event (leer = FCP legt eins mit Datum an)", text: $model.eventName)
				}
				Text(timebaseText).font(.caption).foregroundStyle(.secondary)

				GroupBox("A · Marker-Clip (berührt das Projekt nicht)") {
					VStack(alignment: .leading, spacing: 8) {
						Text(
							"Ein leerer Clip mit allen Kommentaren als Marker. Am Timeline-Anfang als verbundenen Clip ablegen, dann stimmen die Zeiten."
						)
						.font(.caption).foregroundStyle(.secondary)
						HStack {
							FCPXMLDragHandle(
								title: "Marker-Clip in die Timeline ziehen", version: model.version, mode: model.dragMode,
								makeData: { model.markerClipData() }, writeFile: { model.dragFile($0, name: "PostPin Marker") },
								onEvent: { model.write("A: \($0)") }
							)
							.frame(width: 280, height: 36)
							Button("Per Apple Event importieren") { model.importIntoFCP(model.markerClipData(), name: "PostPin Marker") }
							Button("Sichern…") { model.save(model.markerClipData(), name: "PostPin Marker") }
						}
					}
					.frame(maxWidth: .infinity, alignment: .leading)
					.padding(4)
				}

				GroupBox("B · Projekt-Kopie mit Markern (braucht ein gezogenes Projekt)") {
					VStack(alignment: .leading, spacing: 8) {
						Text(
							"Das gezogene Projekt mit den Kommentaren als Marker auf den Clips der Primary Storyline. Mit gleichem Namen + UID im selben Event testen, ob FCP ‚Ersetzen‘ anbietet."
						)
						.font(.caption).foregroundStyle(.secondary)
						Toggle("Namen behalten (sonst „… (PostPin)“)", isOn: $model.keepName)
						Toggle("Projekt-UID behalten", isOn: $model.keepUID)
						Toggle("import-options: library location (aus FCPXML oder Live-Timeline)", isOn: $model.useLibraryLocation)
						Toggle("import-options: suppress warnings", isOn: $model.suppressWarnings)
						HStack {
							FCPXMLDragHandle(
								title: "Projekt-Kopie in den Browser ziehen", version: model.version, mode: model.dragMode,
								blocked: model.project == nil ? "zuerst ein Projekt in Tab 1 ziehen" : nil,
								makeData: { model.projectCopyData() }, writeFile: { model.dragFile($0, name: model.copyName) },
								onEvent: { model.write("B: \($0)") }
							)
							.frame(width: 280, height: 36)
							// .disabled only on the buttons: on the whole HStack it can swallow the drag handle's mouse events
							Group {
								Button("Per Apple Event importieren") { model.importIntoFCP(model.projectCopyData(), name: model.copyName) }
								Button("Sichern…") { model.save(model.projectCopyData(), name: model.copyName) }
							}
							.disabled(model.project == nil)
						}
						if let result = model.lastPlacement {
							Text((result.placed + result.skipped.map { "⚠️ " + $0 }).joined(separator: "\n"))
								.font(.caption.monospaced()).textSelection(.enabled)
						}
					}
					.frame(maxWidth: .infinity, alignment: .leading)
					.padding(4)
				}
			}
			.padding()
		}
	}

	private var timebaseText: String {
		let (start, fd) = model.timebase
		let source = model.project != nil ? "gezogenes Projekt" : model.live != nil ? "Live-Timeline" : "Standard (keine Timeline bekannt)"
		return "Zeitbasis: \(source) · Start \(start.timecode(frameDuration: fd)) · \(fd.fcpxml) pro Frame"
	}
}

struct CommentsEditor: View {
	@ObservedObject var model: LabModel

	var body: some View {
		VStack(alignment: .leading, spacing: 6) {
			HStack {
				Text("Kommentare (Fake-PostPin-Daten)").font(.headline)
				Spacer()
				if model.live != nil {
					Button("+ Kommentar am Playhead") { model.addCommentAtPlayhead() }
						.help("Nur in dieser Liste. In FCP erscheint er erst über Tab 2 als Marker.")
				}
				Button("+ Kommentar") {
					model.comments.append(LabComment(seconds: (model.comments.last?.seconds ?? 0) + 2, author: "Ich", text: "Neu", kind: .standard))
					model.onCommentsChanged?()
				}
				Button("Beispiele") {
					model.comments = LabModel.sampleComments
					model.onCommentsChanged?()
				}
			}
			ForEach($model.comments) { $comment in
				HStack {
					if model.movePlayhead != nil {
						Button {
							model.jump(to: comment)
						} label: {
							Image(systemName: "play.circle")
						}
						.buttonStyle(.borderless)
						.help("Playhead in FCP hierhin setzen")
					}
					TextField("s", value: $comment.seconds, format: .number.precision(.fractionLength(0...3)))
						.frame(width: 70)
					Picker("", selection: $comment.kind) {
						ForEach(MarkerKind.allCases) { Text($0.label).tag($0) }
					}
					.frame(width: 150)
					TextField("Autor", text: $comment.author).frame(width: 120)
					TextField("Text", text: $comment.text)
					Text(comment.tag).font(.caption.monospaced()).foregroundStyle(.secondary)
					Button {
						model.comments.removeAll { $0.id == comment.id }
						model.onCommentsChanged?()
					} label: {
						Image(systemName: "trash")
					}
					.buttonStyle(.borderless)
				}
			}
		}
	}
}

// MARK: log

struct LogView: View {
	@ObservedObject var model: LabModel

	var body: some View {
		VStack(alignment: .leading) {
			HStack {
				Text("Alles, was FCP und das Lab austauschen").font(.headline)
				Spacer()
				Button("Kopieren") {
					let text = model.log.map { "\($0.date.formatted(date: .omitted, time: .standard))  \($0.text)" }.joined(separator: "\n")
					NSPasteboard.general.clearContents()
					NSPasteboard.general.setString(text, forType: .string)
				}
				Button("Leeren") { model.log.removeAll() }
			}
			ScrollViewReader { proxy in
				List(model.log) { line in
					HStack(alignment: .top) {
						Text(line.date.formatted(date: .omitted, time: .standard)).foregroundStyle(.secondary)
						Text(line.text).textSelection(.enabled)
					}
					.font(.caption.monospaced())
					.id(line.id)
				}
				.onChange(of: model.log.count) {
					if let last = model.log.last { proxy.scrollTo(last.id, anchor: .bottom) }
				}
			}
		}
		.padding()
	}
}
