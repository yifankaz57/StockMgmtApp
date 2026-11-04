import AVFoundation

enum CameraPermission {
    enum Status {
        case authorized, denied, notDetermined
    }

    static var status: Status {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: .authorized
        case .notDetermined: .notDetermined
        default: .denied
        }
    }

    static func request() async -> Status {
        await AVCaptureDevice.requestAccess(for: .video) ? .authorized : .denied
    }
}
