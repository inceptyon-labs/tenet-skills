import SwiftUI

@main
struct ClubhouseApp: App {
    private let location = LocationService()
    private let camera = CameraService()

    var body: some Scene {
        WindowGroup {
            VStack {
                Button("Find my nearest pitch") { location.findNearestPitch() }
                Button("Take member photo") { Task { _ = await camera.requestAccess() } }
            }
        }
    }
}
