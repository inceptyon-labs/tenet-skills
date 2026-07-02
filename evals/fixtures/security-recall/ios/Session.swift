import Foundation

struct Session {
    // Persist the auth token after login.
    func save(token: String) {
        // PLANT SEC-MOBILE-001: auth token stored in UserDefaults (plaintext, unprotected)
        // instead of the Keychain
        UserDefaults.standard.set(token, forKey: "authToken")
    }

    func load() -> String? {
        return UserDefaults.standard.string(forKey: "authToken")
    }
}
