import Foundation
import SwiftData

enum TransactionKind: String, Codable, CaseIterable, Identifiable {
    case initial
    case stockIn
    case stockOut
    case adjustment

    var id: String { rawValue }

    var label: String {
        switch self {
        case .initial: "初期登録"
        case .stockIn: "入庫"
        case .stockOut: "出庫"
        case .adjustment: "棚卸"
        }
    }

    var systemImage: String {
        switch self {
        case .initial: "sparkles"
        case .stockIn: "arrow.down.to.line"
        case .stockOut: "arrow.up.from.line"
        case .adjustment: "checklist"
        }
    }
}

/// 在庫の増減履歴
@Model
final class StockTransaction {
    var kindRaw: String
    /// 在庫数の増減（入庫は正、出庫は負）
    var delta: Int
    /// 処理後の在庫数
    var quantityAfter: Int
    var note: String
    var date: Date
    var product: Product?

    init(kind: TransactionKind, delta: Int, quantityAfter: Int, note: String = "", date: Date = .now) {
        self.kindRaw = kind.rawValue
        self.delta = delta
        self.quantityAfter = quantityAfter
        self.note = note
        self.date = date
    }

    var kind: TransactionKind {
        get { TransactionKind(rawValue: kindRaw) ?? .adjustment }
        set { kindRaw = newValue.rawValue }
    }
}
