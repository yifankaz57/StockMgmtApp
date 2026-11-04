import Foundation
import SwiftData

enum InventoryError: LocalizedError {
    case invalidAmount
    case insufficientStock(available: Int)
    case duplicateBarcode
    case emptyBarcode
    case emptyName

    var errorDescription: String? {
        switch self {
        case .invalidAmount: "数量は1以上を指定してください。"
        case .insufficientStock(let available): "在庫が不足しています（現在の在庫: \(available)）。"
        case .duplicateBarcode: "このバーコードは既に登録されています。"
        case .emptyBarcode: "バーコードを入力してください。"
        case .emptyName: "商品名を入力してください。"
        }
    }
}

/// 在庫操作の計算ロジック（UI から独立）
enum InventoryCalculator {
    /// 操作後の在庫数と増減量を返す。
    /// - Parameter amount: 入庫/出庫では移動数量、棚卸では実在庫数
    static func result(current: Int, kind: TransactionKind, amount: Int) throws -> (newQuantity: Int, delta: Int) {
        switch kind {
        case .stockIn, .initial:
            guard amount > 0 else { throw InventoryError.invalidAmount }
            return (current + amount, amount)
        case .stockOut:
            guard amount > 0 else { throw InventoryError.invalidAmount }
            guard amount <= current else { throw InventoryError.insufficientStock(available: current) }
            return (current - amount, -amount)
        case .adjustment:
            guard amount >= 0 else { throw InventoryError.invalidAmount }
            return (amount, amount - current)
        }
    }
}

extension Product {
    /// 在庫を変更し、履歴を記録する。
    @discardableResult
    func apply(_ kind: TransactionKind, amount: Int, note: String = "", in context: ModelContext) throws -> StockTransaction {
        let (newQuantity, delta) = try InventoryCalculator.result(current: quantity, kind: kind, amount: amount)
        let transaction = StockTransaction(kind: kind, delta: delta, quantityAfter: newQuantity, note: note)
        context.insert(transaction)
        transaction.product = self
        quantity = newQuantity
        updatedAt = .now
        try context.save()
        return transaction
    }
}

extension ModelContext {
    func product(barcode: String) -> Product? {
        let code = barcode
        var descriptor = FetchDescriptor<Product>(predicate: #Predicate { $0.barcode == code })
        descriptor.fetchLimit = 1
        return try? fetch(descriptor).first
    }
}
