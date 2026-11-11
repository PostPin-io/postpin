import SwiftUI
import WebKit

// PROTOTYPE: checks whether a WKWebView (the future home of the plugin-core Svelte UI) works inside the
// workflow extension, and whether a JS ↔ Swift bridge can drive the FCP playhead.

struct WebBridgeView: View {
	@ObservedObject var model: LabModel
	@State private var urlText = ""
	@State private var loadToken = 0
	@State private var loadURL: URL?

	var body: some View {
		VStack(alignment: .leading, spacing: 8) {
			HStack {
				Button("Bridge-Demo") {
					loadURL = nil
					loadToken += 1
				}
				TextField("oder URL laden, z. B. http://localhost:5173 (plugin-core UI) oder https://…", text: $urlText)
					.onSubmit(load)
				Button("Laden", action: load)
			}
			Text("Die Demo-Seite ruft window.webkit.messageHandlers.lab.postMessage(…) auf; Swift schiebt Playhead und Kommentare per evaluateJavaScript zurück.")
				.font(.caption).foregroundStyle(.secondary)
			LabWebView(model: model, url: loadURL, token: loadToken)
				.clipShape(RoundedRectangle(cornerRadius: 6))
		}
		.padding()
	}

	private func load() {
		guard let url = URL(string: urlText), url.scheme != nil else {
			model.write("WebView: ungültige URL '\(urlText)'")
			return
		}
		loadURL = url
		loadToken += 1
	}
}

struct LabWebView: NSViewRepresentable {
	@ObservedObject var model: LabModel
	var url: URL?
	var token: Int

	func makeCoordinator() -> Coordinator { Coordinator(model: model) }

	func makeNSView(context: Context) -> WKWebView {
		let config = WKWebViewConfiguration()
		config.userContentController.add(context.coordinator, name: "lab")
		let web = WKWebView(frame: .zero, configuration: config)
		web.navigationDelegate = context.coordinator
		web.isInspectable = true
		context.coordinator.web = web
		context.coordinator.load(url: url, token: token)
		return web
	}

	func updateNSView(_ web: WKWebView, context: Context) {
		context.coordinator.load(url: url, token: token)
		context.coordinator.push()
	}

	@MainActor
	final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
		let model: LabModel
		weak var web: WKWebView?
		private var loadedToken = -1
		private var lastPush = ""

		init(model: LabModel) { self.model = model }

		func load(url: URL?, token: Int) {
			guard token != loadedToken, let web else { return }
			loadedToken = token
			lastPush = ""
			if let url {
				model.write("WebView lädt \(url.absoluteString)")
				web.load(URLRequest(url: url))
			} else {
				web.loadHTMLString(Self.demoHTML, baseURL: nil)
			}
		}

		/// sends the current state to the page, only when it changed
		func push() {
			guard let web else { return }
			let fd = model.live?.frameDuration ?? model.timebase.frameDuration
			let state: [String: Any] = [
				"host": model.host.rawValue,
				"sequence": model.live?.sequenceName ?? model.project?.name ?? "–",
				"playhead": model.live.map { $0.playhead.timecode(frameDuration: fd) } ?? "– (nur in der Extension live)",
				"comments": model.comments.map {
					["id": $0.id.uuidString, "seconds": $0.seconds, "text": $0.text, "author": $0.author, "kind": $0.kind.rawValue]
				},
			]
			guard let json = try? JSONSerialization.data(withJSONObject: state), let s = String(data: json, encoding: .utf8),
				s != lastPush
			else { return }
			lastPush = s
			web.evaluateJavaScript("window.labUpdate && window.labUpdate(\(s))")
		}

		func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
			guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
				model.write("WebView → Swift: \(message.body)")
				return
			}
			model.write("WebView → Swift: \(type)")
			switch type {
			case "jump":
				if let id = body["id"] as? String, let comment = model.comments.first(where: { $0.id.uuidString == id }) {
					if model.movePlayhead == nil { model.write("  (kein Playhead-Zugriff außerhalb der Extension)") }
					model.jump(to: comment)
				}
			case "addAtPlayhead":
				model.addCommentAtPlayhead()
			default:
				break
			}
			lastPush = ""
			push()
		}

		func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
			model.write("WebView geladen: \(webView.url?.absoluteString ?? "Bridge-Demo")")
			lastPush = ""
			push()
		}

		func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
			model.write("WebView-Fehler: \(error.localizedDescription)")
		}

		func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
			model.write("WebView-Fehler: \(error.localizedDescription)")
		}

		static let demoHTML = """
			<!doctype html><html><head><meta charset="utf-8"><style>
			:root { color-scheme: light dark; font: 13px -apple-system, sans-serif; }
			body { margin: 12px; }
			.ph { font: 600 22px ui-monospace, monospace; }
			li { padding: 6px 8px; border-radius: 6px; cursor: pointer; list-style: none; display: flex; gap: 8px; }
			li:hover { background: color-mix(in oklch, CanvasText 10%, transparent); }
			ul { padding: 0; }
			.dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; }
			.standard { background: #3b82f6 } .todo { background: #ef4444 } .done { background: #22c55e } .chapter { background: #f97316 }
			small { opacity: .6 }
			</style></head><body>
			<div><small id="meta"></small></div>
			<div class="ph" id="ph">–</div>
			<button onclick="send({type:'addAtPlayhead'})">+ Kommentar am Playhead</button>
			<p><small>Klick auf einen Kommentar → Swift → FCPXTimeline.movePlayhead</small></p>
			<ul id="list"></ul>
			<script>
			function send(msg) { window.webkit.messageHandlers.lab.postMessage(msg); }
			window.labUpdate = (s) => {
			  document.getElementById('meta').textContent = s.host + ' · ' + s.sequence;
			  document.getElementById('ph').textContent = s.playhead;
			  const list = document.getElementById('list');
			  list.replaceChildren(...s.comments.map(c => {
			    const li = document.createElement('li');
			    li.innerHTML = '<span class="dot ' + c.kind + '"></span><span><b></b><br><small></small></span>';
			    li.querySelector('b').textContent = c.text;
			    li.querySelector('small').textContent = c.seconds.toFixed(2) + 's · ' + c.author;
			    li.onclick = () => send({type:'jump', id: c.id});
			    return li;
			  }));
			};
			</script></body></html>
			"""
	}
}
