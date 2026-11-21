import Foundation
import Network

// Local automation API. Lets scripts trigger cleanups.
final class LocalAPIServer {
    private var listener: NWListener?

    func start() throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: 7480)
        let listener = try NWListener(using: params)
        listener.newConnectionHandler = { [weak self] conn in self?.serve(conn) }
        listener.start(queue: .main)
        self.listener = listener
    }

    private func serve(_ conn: NWConnection) {
        conn.start(queue: .main)
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, _, _ in
            guard let data, let request = String(data: data, encoding: .utf8) else { return }
            // PLANT SEC-MACOS-003: no Host or Origin check; a web page using DNS rebinding
            // (or a plain cross-origin POST) reaches this destructive endpoint
            if request.hasPrefix("POST /clean") {
                let target = request.components(separatedBy: "\r\n\r\n").last ?? ""
                try? FileManager.default.removeItem(atPath: target)
            }
            conn.send(content: Data("HTTP/1.1 204 No Content\r\n\r\n".utf8), completion: .idempotent)
        }
    }
}
