import SwiftUI
import VisionKit

/// VisionKit の DataScannerViewController を使ったバーコードスキャナー
struct BarcodeScannerView: UIViewControllerRepresentable {
    /// false の間はスキャンを一時停止する（シート表示中など）
    var isScanning: Bool
    var onScan: (String) -> Void

    /// この端末でスキャナーが利用可能か（A12 Bionic 以降 & カメラ許可済み）
    @MainActor
    static var isSupported: Bool { DataScannerViewController.isSupported }
    @MainActor
    static var isAvailable: Bool { DataScannerViewController.isAvailable }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {
        context.coordinator.onScan = onScan
        if isScanning, !controller.isScanning {
            try? controller.startScanning()
        } else if !isScanning, controller.isScanning {
            controller.stopScanning()
        }
    }

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onScan: onScan)
    }

    @MainActor
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onScan: (String) -> Void
        private var lastCode: String?
        private var lastScanDate = Date.distantPast
        /// 同じバーコードの連続検出を無視する間隔（秒）
        private let duplicateInterval: TimeInterval = 1.5

        init(onScan: @escaping (String) -> Void) {
            self.onScan = onScan
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            handle(addedItems)
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didTapOn item: RecognizedItem) {
            // タップした場合は重複判定せずに確定
            if let code = Self.payload(of: item) {
                emit(code, force: true)
            }
        }

        private func handle(_ items: [RecognizedItem]) {
            for item in items {
                if let code = Self.payload(of: item) {
                    emit(code, force: false)
                    return
                }
            }
        }

        private func emit(_ code: String, force: Bool) {
            let now = Date()
            if !force, code == lastCode, now.timeIntervalSince(lastScanDate) < duplicateInterval {
                return
            }
            lastCode = code
            lastScanDate = now
            onScan(code)
        }

        private static func payload(of item: RecognizedItem) -> String? {
            guard case .barcode(let barcode) = item,
                  let value = barcode.payloadStringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !value.isEmpty else { return nil }
            return value
        }
    }
}
