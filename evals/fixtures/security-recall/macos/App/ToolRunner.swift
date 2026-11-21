import Foundation

// Runs in the app process as the logged-in user.
enum ToolRunner {
    // DECOY same-user-subprocess: user-context app runs a user-installed tool with an argv array.
    // The Homebrew prefix is user-writable, but so is everything else this process can touch.
    static func brewCleanup() throws -> Int32 {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/brew")
        p.arguments = ["cleanup", "--prune=30"]
        try p.run()
        p.waitUntilExit()
        return p.terminationStatus
    }
}
