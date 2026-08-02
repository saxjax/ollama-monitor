import AppKit
import Darwin
import Foundation
import UniformTypeIdentifiers
import WebKit

final class MonitorDragBar: NSView {
    override var mouseDownCanMoveWindow: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor(calibratedRed: 0.025, green: 0.045, blue: 0.037, alpha: 0.98).cgColor
        layer?.borderColor = NSColor(calibratedRed: 0.15, green: 0.20, blue: 0.17, alpha: 1).cgColor
        layer?.borderWidth = 0.5
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

final class MonitorAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let monitorURL = ProcessInfo.processInfo.environment["OLLAMA_MONITOR_URL"]
        .flatMap(URL.init(string:))
        ?? (Bundle.main.object(forInfoDictionaryKey: "OllamaMonitorURL") as? String).flatMap(URL.init(string:))
        ?? URL(string: "http://127.0.0.1:11435/monitor/")!
    private let serviceLabel = Bundle.main.object(forInfoDictionaryKey: "MonitorServiceLabel") as? String
        ?? "io.github.saxjax.ollama-monitor"
    private let widgetModeKey = "widgetModeEnabled"
    private let normalFrameKey = "normalWindowFrame"
    private let normalMinimumSize = NSSize(width: 760, height: 580)
    private let widgetMinimumSize = NSSize(width: 380, height: 460)
    private let widgetSize = NSSize(width: 500, height: 680)
    private var window: NSWindow!
    private var webView: WKWebView!
    private var surfaceButton: NSButton!
    private var widgetButton: NSButton!
    private var widgetMenuItem: NSMenuItem!
    private var isWidgetMode = false
    private var normalWindowFrame: NSRect?
    private var loadAttempts = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        configureWindow()
        ensureMonitorService()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.loadMonitor()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        sender.activate(ignoringOtherApps: true)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        rememberNormalFrame()
    }

    private func configureMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Saxjax Monitor", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Saxjax Monitor", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "View")
        let reloadItem = NSMenuItem(title: "Reload Monitor", action: #selector(reloadMonitor), keyEquivalent: "r")
        reloadItem.target = self
        viewMenu.addItem(reloadItem)
        let browserItem = NSMenuItem(title: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "b")
        browserItem.target = self
        viewMenu.addItem(browserItem)
        viewMenu.addItem(.separator())
        let monitorItem = NSMenuItem(title: "Open Monitor", action: #selector(openMonitor), keyEquivalent: "m")
        monitorItem.target = self
        viewMenu.addItem(monitorItem)
        let prototypeItem = NSMenuItem(title: "Open Prototype Lab", action: #selector(openPrototypeLab), keyEquivalent: "p")
        prototypeItem.target = self
        viewMenu.addItem(prototypeItem)
        let compareItem = NSMenuItem(title: "Compare Prototype Feedback", action: #selector(openPrototypeComparison), keyEquivalent: "p")
        compareItem.keyEquivalentModifierMask = [.command, .shift]
        compareItem.target = self
        viewMenu.addItem(compareItem)
        viewMenu.addItem(.separator())
        widgetMenuItem = NSMenuItem(title: "Enter Widget Mode", action: #selector(toggleWidgetMode), keyEquivalent: "w")
        widgetMenuItem.keyEquivalentModifierMask = [.command, .shift]
        widgetMenuItem.target = self
        viewMenu.addItem(widgetMenuItem)
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        NSApp.mainMenu = mainMenu
    }

    private func configureWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "prototypeExport")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.underPageBackgroundColor = NSColor(calibratedRed: 0.02, green: 0.032, blue: 0.027, alpha: 1)

        let rootView = NSView(frame: .zero)
        rootView.wantsLayer = true
        rootView.layer?.backgroundColor = NSColor(calibratedRed: 0.02, green: 0.032, blue: 0.027, alpha: 1).cgColor

        let dragBar = MonitorDragBar(frame: .zero)
        dragBar.toolTip = "Drag here to move the monitor"
        dragBar.setAccessibilityLabel("Window drag handle")

        let dragLabel = NSTextField(labelWithString: "SAXJAX MONITOR   ·   DRAG TO MOVE")
        dragLabel.font = NSFont.monospacedSystemFont(ofSize: 9, weight: .medium)
        dragLabel.textColor = NSColor(calibratedRed: 0.51, green: 0.57, blue: 0.53, alpha: 1)
        dragLabel.lineBreakMode = .byTruncatingTail

        surfaceButton = NSButton(title: "LAB", target: self, action: #selector(togglePrototypeSurface))
        surfaceButton.bezelStyle = .roundRect
        surfaceButton.controlSize = .small
        surfaceButton.font = NSFont.monospacedSystemFont(ofSize: 9, weight: .semibold)
        surfaceButton.toolTip = "Switch between the live monitor and prototype review lab"
        surfaceButton.setAccessibilityLabel("Toggle prototype review lab")

        widgetButton = NSButton(title: "WIDGET", target: self, action: #selector(toggleWidgetMode))
        widgetButton.bezelStyle = .roundRect
        widgetButton.controlSize = .small
        widgetButton.font = NSFont.monospacedSystemFont(ofSize: 9, weight: .semibold)
        widgetButton.toolTip = "Switch between the full monitor and floating widget"
        widgetButton.setAccessibilityLabel("Toggle widget mode")

        [dragBar, webView].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            rootView.addSubview($0)
        }
        [dragLabel, surfaceButton, widgetButton].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            dragBar.addSubview($0)
        }

        NSLayoutConstraint.activate([
            dragBar.topAnchor.constraint(equalTo: rootView.topAnchor),
            dragBar.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            dragBar.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            dragBar.heightAnchor.constraint(equalToConstant: 38),

            webView.topAnchor.constraint(equalTo: dragBar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),

            dragLabel.leadingAnchor.constraint(equalTo: dragBar.leadingAnchor, constant: 78),
            dragLabel.centerYAnchor.constraint(equalTo: dragBar.centerYAnchor),
            dragLabel.trailingAnchor.constraint(lessThanOrEqualTo: surfaceButton.leadingAnchor, constant: -12),

            surfaceButton.trailingAnchor.constraint(equalTo: widgetButton.leadingAnchor, constant: -8),
            surfaceButton.centerYAnchor.constraint(equalTo: dragBar.centerYAnchor),
            surfaceButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 58),
            surfaceButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 26),

            widgetButton.trailingAnchor.constraint(equalTo: dragBar.trailingAnchor, constant: -10),
            widgetButton.centerYAnchor.constraint(equalTo: dragBar.centerYAnchor),
            widgetButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 74),
            widgetButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 26)
        ])

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Saxjax Monitor"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.backgroundColor = NSColor(calibratedRed: 0.02, green: 0.032, blue: 0.027, alpha: 1)
        window.minSize = normalMinimumSize
        window.contentView = rootView
        window.delegate = self
        window.isMovable = true
        window.isMovableByWindowBackground = false
        window.setFrameAutosaveName("OllamaMonitorWindow")
        window.center()
        normalWindowFrame = restoredNormalFrame() ?? window.frame
        window.makeKeyAndOrderFront(nil)
        setWidgetMode(UserDefaults.standard.bool(forKey: widgetModeKey), animated: false, persist: false)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func restoredNormalFrame() -> NSRect? {
        guard let value = UserDefaults.standard.string(forKey: normalFrameKey) else { return nil }
        let frame = NSRectFromString(value)
        guard frame.width >= normalMinimumSize.width, frame.height >= normalMinimumSize.height else { return nil }
        return frame
    }

    private func rememberNormalFrame() {
        guard window != nil, !isWidgetMode else { return }
        normalWindowFrame = window.frame
        UserDefaults.standard.set(NSStringFromRect(window.frame), forKey: normalFrameKey)
    }

    @objc private func toggleWidgetMode() {
        setWidgetMode(!isWidgetMode, animated: true, persist: true)
    }

    private func setWidgetMode(_ enabled: Bool, animated: Bool, persist: Bool) {
        guard window != nil else { return }
        guard enabled != isWidgetMode || !persist else { return }

        if enabled {
            if normalWindowFrame == nil {
                normalWindowFrame = restoredNormalFrame() ?? window.frame
            }
            if !isWidgetMode && persist {
                rememberNormalFrame()
            }

            isWidgetMode = true

            let current = window.frame
            let target = NSRect(
                x: current.maxX - widgetSize.width,
                y: current.maxY - widgetSize.height,
                width: widgetSize.width,
                height: widgetSize.height
            )
            window.minSize = widgetMinimumSize
            window.level = .floating
            window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .participatesInCycle]
            window.setFrame(target, display: true, animate: animated)
        } else {
            isWidgetMode = false
            window.level = .normal
            window.collectionBehavior = [.managed, .participatesInCycle]
            window.minSize = normalMinimumSize
            if let frame = normalWindowFrame ?? restoredNormalFrame() {
                window.setFrame(frame, display: true, animate: animated)
            }
        }

        widgetButton.title = enabled ? "FULL VIEW" : "WIDGET"
        widgetButton.toolTip = enabled ? "Return to the full monitor" : "Open as a floating widget"
        widgetMenuItem.title = enabled ? "Exit Widget Mode" : "Enter Widget Mode"
        window.title = enabled ? "Saxjax Monitor — Widget" : "Saxjax Monitor"
        if persist {
            UserDefaults.standard.set(enabled, forKey: widgetModeKey)
        }
    }

    func windowDidMove(_ notification: Notification) {
        rememberNormalFrame()
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        rememberNormalFrame()
    }

    private func runLaunchctl(_ arguments: [String]) -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus
        } catch {
            return -1
        }
    }

    private func ensureMonitorService() {
        let domain = "gui/\(getuid())"
        let service = "\(domain)/\(serviceLabel)"

        // The monitor must be able to start independently of Ollama. Re-enable
        // only this LaunchAgent in case it was unloaded or disabled previously.
        _ = runLaunchctl(["enable", service])
        if runLaunchctl(["kickstart", service]) == 0 {
            return
        }

        let launchAgent = NSString(string: "~/Library/LaunchAgents/\(serviceLabel).plist").expandingTildeInPath
        guard FileManager.default.fileExists(atPath: launchAgent) else { return }
        _ = runLaunchctl(["bootstrap", domain, launchAgent])
        _ = runLaunchctl(["kickstart", service])
    }

    private func loadMonitor() {
        loadAttempts += 1
        webView.load(URLRequest(url: monitorURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 3))
    }

    private func prototypeURL(compare: Bool = false) -> URL {
        var components = URLComponents(url: monitorURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "prototype", value: "monitor"),
            URLQueryItem(name: "variant", value: "A")
        ]
        if compare {
            components.queryItems?.append(URLQueryItem(name: "review", value: "compare"))
        }
        return components.url!
    }

    private func loadSurface(_ url: URL) {
        loadAttempts = 1
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 3))
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func reloadMonitor() {
        loadAttempts = 0
        ensureMonitorService()
        loadMonitor()
    }

    @objc private func openInBrowser() {
        NSWorkspace.shared.open(webView.url ?? monitorURL)
    }

    @objc private func openMonitor() {
        loadSurface(monitorURL)
    }

    @objc private func openPrototypeLab() {
        loadSurface(prototypeURL())
    }

    @objc private func openPrototypeComparison() {
        loadSurface(prototypeURL(compare: true))
    }

    @objc private func togglePrototypeSurface() {
        let components = webView.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        let isPrototype = components?.queryItems?.contains(where: { $0.name == "prototype" && $0.value == "monitor" }) == true
        if isPrototype { openMonitor() } else { openPrototypeLab() }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "prototypeExport",
              let payload = message.body as? [String: Any],
              let content = payload["content"] as? String,
              content.utf8.count <= 10_000_000 else { return }
        let proposed = (payload["filename"] as? String ?? "saxjax-prototype-review.json")
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
        let panel = NSSavePanel()
        panel.nameFieldStringValue = proposed
        panel.allowedContentTypes = [.json]
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try content.write(to: url, atomically: true, encoding: .utf8)
            } catch {
                let alert = NSAlert(error: error)
                alert.beginSheetModal(for: self.window)
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        panel.allowedContentTypes = [.json]
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadAttempts = 0
        let components = webView.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        let isPrototype = components?.queryItems?.contains(where: { $0.name == "prototype" && $0.value == "monitor" }) == true
        surfaceButton.title = isPrototype ? "MONITOR" : "LAB"
        surfaceButton.toolTip = isPrototype ? "Return to the live monitor" : "Open the prototype review lab"
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard loadAttempts < 16 else {
            showConnectionError(error)
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
            self?.loadMonitor()
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.host == monitorURL.host && url.port == monitorURL.port {
            decisionHandler(.allow)
        } else if navigationAction.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.cancel)
        }
    }

    private func showConnectionError(_ error: Error) {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Monitor service is not responding"
        alert.informativeText = "The local monitor gateway did not start. Ollama does not need to be running; when it is off, the dashboard should open normally and show OFFLINE. Choose Try Again to restart only the monitor gateway.\n\n\(error.localizedDescription)"
        alert.addButton(withTitle: "Try Again")
        alert.addButton(withTitle: "Close")
        alert.beginSheetModal(for: window) { [weak self] response in
            if response == .alertFirstButtonReturn {
                self?.reloadMonitor()
            }
        }
    }
}

let application = NSApplication.shared
let delegate = MonitorAppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
