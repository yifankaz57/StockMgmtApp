import Foundation
import SwiftData

/// 在庫管理の対象となる商品。バーコードで一意に識別する。
@Model
final class Product {
    @Attribute(.unique) var barcode: String
    var name: String
    var quantity: Int
    /// この数量以下になったら「在庫少」として警告する（0 なら警告しない）
    var minimumQuantity: Int
    var location: String
    var note: String
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \StockTransaction.product)
    var transactions: [StockTransaction] = []

    init(
        barcode: String,
        name: String,
        quantity: Int = 0,
        minimumQuantity: Int = 0,
        location: String = "",
        note: String = ""
    ) {
        self.barcode = barcode
        self.name = name
        self.quantity = quantity
        self.minimumQuantity = minimumQuantity
        self.location = location
        self.note = note
        self.createdAt = .now
        self.updatedAt = .now
    }

    var isLowStock: Bool {
        minimumQuantity > 0 && quantity <= minimumQuantity
    }

    var sortedTransactions: [StockTransaction] {
        transactions.sorted { $0.date > $1.date }
    }
}
