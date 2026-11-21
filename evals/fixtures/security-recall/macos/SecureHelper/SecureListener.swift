import Foundation

// Second helper, registered with SMAppService.daemon(plistName:); runs as root.
final class SecureHelperDelegate: NSObject, NSXPCListenerDelegate {
    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection connection: NSXPCConnection) -> Bool {
        // DECOY xpc-codesign-requirement: framework-enforced, audit-token based, pins Team ID
        connection.setCodeSigningRequirement(
            #"identifier "com.acme.cleaner" and anchor apple generic and certificate leaf[subject.OU] = "ABCDE12345""#
        )
        connection.exportedInterface = NSXPCInterface(with: StatusProtocol.self)
        connection.exportedObject = StatusService()
        connection.resume()
        return true
    }
}

@objc protocol StatusProtocol {
    func version(reply: @escaping (Int) -> Void)
}

final class StatusService: NSObject, StatusProtocol {
    func version(reply: @escaping (Int) -> Void) { reply(3) }
}
