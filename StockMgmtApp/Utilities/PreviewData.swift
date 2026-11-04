import Foundation
import SwiftData

/// Xcode プレビュー用のサンプルデータ
@MainActor
enum PreviewData {
    static let container: ModelContainer = {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        // swiftlint:disable:next force_try
        let container = try! ModelContainer(for: Product.self, StockTransaction.self, configurations: config)
        let context = container.mainContext
        let samples: [(String, String, Int, Int, String)] = [
            ("4901234567894", "ボールペン 黒 0.5mm", 42, 10, "棚A-1"),
            ("4909876543210", "A4 コピー用紙 500枚", 3, 5, "倉庫B"),
            ("4512345678901", "付箋 75×75mm", 18, 0, "棚A-2"),
        ]
        for (barcode, name, quantity, minimum, location) in samples {
            let product = Product(barcode: barcode, name: name, minimumQuantity: minimum, location: location)
            context.insert(product)
            try? product.apply(.initial, amount: quantity, in: context)
        }
        return container
    }()

    static var sampleProduct: Product {
        let descriptor = FetchDescriptor<Product>(sortBy: [SortDescriptor(\.name)])
        return (try? container.mainContext.fetch(descriptor).first) ?? Product(barcode: "0000000000000", name: "サンプル")
    }
}
