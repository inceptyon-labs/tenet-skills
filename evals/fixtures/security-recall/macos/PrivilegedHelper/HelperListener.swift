import Foundation

// Registered with SMAppService.daemon(plistName:); launchd runs this as root.
final class HelperDelegate: NSObject, NSXPCListenerDelegate {
    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection connection: NSXPCConnection) -> Bool {
        // PLANT SEC-MACOS-001: root listener accepts any local process; no code-signing
        // requirement on the peer
        connection.exportedInterface = NSXPCInterface(with: TrashServiceProtocol.self)
        connection.exportedObject = TrashService()
        connection.resume()
        return true
    }
}

let listener = NSXPCListener(machServiceName: "com.acme.cleaner.helper")
let delegate = HelperDelegate()
listener.delegate = delegate
listener.resume()
RunLoop.main.run()
