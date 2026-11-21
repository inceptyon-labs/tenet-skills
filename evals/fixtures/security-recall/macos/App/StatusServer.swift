import Foundation
import Network

// Loopback status feed for a menu bar widget.
final class StatusServer {
    private var listener: NWListener?
    private static let allowedHosts: Set<String> = ["127.0.0.1", "::1", "localhost"]

    func start() throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 7481)
        let listener = try NWListener(using: params)
        listener.newConnectionHandler = { [weak self] conn in self?.serve(conn) }
        listener.start(queue: .main)
        self.listener = listener
    }

    // DECOY loopback-host-checked-no-token: loopback bind + Host allowlist + no CORS headers.
    // No bearer token, but any native process running as the user already has the user's rights.
    static func hostAllowed(_ request: String) -> Bool {
        guard let line = request.components(separatedBy: "\r\n").first(where: { $0.lowercased().hasPrefix("host:") })
        else { return false }
        let value = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
        let host = value.split(separator: ":").first.map(String.init) ?? value
        return allowedHosts.contains(host)
    }

    private func serve(_ conn: NWConnection) {
        conn.start(queue: .main)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 8_192) { data, _, _, _ in
            guard let data, let request = String(data: data, encoding: .utf8),
                  Self.hostAllowed(request), request.hasPrefix("GET /status") else {
                conn.send(content: Data("HTTP/1.1 403 Forbidden\r\n\r\n".utf8), completion: .idempotent)
                return
            }
            conn.send(content: Data("HTTP/1.1 200 OK\r\n\r\n{\"ok\":true}".utf8), completion: .idempotent)
        }
    }
}
