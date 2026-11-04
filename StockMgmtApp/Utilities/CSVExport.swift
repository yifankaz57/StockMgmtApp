import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// 共有シートから書き出せる CSV ファイル
struct CSVDocument: Transferable {
    let fileName: String
    let text: String

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .commaSeparatedText) { document in
            // Excel で文字化けしないよう UTF-8 BOM を付与
            Data([0xEF, 0xBB, 0xBF]) + Data(document.text.utf8)
        }
        .suggestedFileName { $0.fileName }
    }
}

enum CSVExporter {
    static func escape(_ field: String) -> String {
        if field.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) {
            return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return field
    }

    static func row(_ fields: [String]) -> String {
        fields.map(escape).joined(separator: ",")
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/MM/dd HH:mm:ss"
        return formatter
    }()

    static func products(_ products: [Product]) -> CSVDocument {
        var lines = [row(["バーコード", "商品名", "在庫数", "最低在庫数", "保管場所", "メモ", "更新日時"])]
        for p in products {
            lines.append(row([
                p.barcode, p.name, String(p.quantity), String(p.minimumQuantity),
                p.location, p.note, dateFormatter.string(from: p.updatedAt),
            ]))
        }
        return CSVDocument(fileName: "在庫一覧.csv", text: lines.joined(separator: "\r\n") + "\r\n")
    }

    static func transactions(_ transactions: [StockTransaction]) -> CSVDocument {
        var lines = [row(["日時", "バーコード", "商品名", "種別", "増減", "処理後在庫", "メモ"])]
        for t in transactions {
            lines.append(row([
                dateFormatter.string(from: t.date),
                t.product?.barcode ?? "", t.product?.name ?? "(削除済み)",
                t.kind.label, String(t.delta), String(t.quantityAfter), t.note,
            ]))
        }
        return CSVDocument(fileName: "入出庫履歴.csv", text: lines.joined(separator: "\r\n") + "\r\n")
    }
}
