import UIKit

enum Haptics {
    @MainActor static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    @MainActor static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    @MainActor static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}
