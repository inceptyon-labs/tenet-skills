import Foundation

@objc protocol TrashServiceProtocol {
    func moveToTrash(path: String, ownerUID: UInt32, reply: @escaping (Bool) -> Void)
}

// Runs inside the root helper.
final class TrashService: NSObject, TrashServiceProtocol {
    private let allowedRoots = ["/private/tmp/", "/private/var/tmp/", "/Library/Caches/"]

    func moveToTrash(path: String, ownerUID: UInt32, reply: @escaping (Bool) -> Void) {
        let url = URL(fileURLWithPath: path)
        guard allowedRoots.contains(where: { path.hasPrefix($0) }),
              !path.contains(".."),
              url.resolvingSymlinksInPath().path == url.standardizedFileURL.path else {
            return reply(false)
        }
        // PLANT SEC-MACOS-002: only a symlink guard; a hardlink to /etc/sudoers planted in
        // /private/tmp passes it, and the chown below hands the shared inode to the user
        let dest = URL(fileURLWithPath: "/Users/\(ownerUID)/.Trash").appendingPathComponent(url.lastPathComponent)
        do {
            try FileManager.default.moveItem(at: url, to: dest)
            lchown(dest.path, ownerUID, 20)
            reply(true)
        } catch {
            reply(false)
        }
    }
}
