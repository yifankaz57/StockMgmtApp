import SwiftUI
import SwiftData

struct HistoryView: View {
    @Query(sort: \StockTransaction.date, order: .reverse) private var transactions: [StockTransaction]

    @State private var kindFilter: TransactionKind?

    private var filtered: [StockTransaction] {
        guard let kindFilter else { return transactions }
        return transactions.filter { $0.kind == kindFilter }
    }

    private struct DayGroup: Identifiable {
        let day: Date
        let items: [StockTransaction]
        var id: Date { day }
    }

    /// 日付ごとにグループ化
    private var groupedByDay: [DayGroup] {
        let calendar = Calendar.current
        let groups = Dictionary(grouping: filtered) { calendar.startOfDay(for: $0.date) }
        return groups.keys.sorted(by: >).map { DayGroup(day: $0, items: groups[$0] ?? []) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(groupedByDay) { group in
                    Section(group.day.formatted(date: .complete, time: .omitted)) {
                        ForEach(group.items) { transaction in
                            if let product = transaction.product {
                                NavigationLink(value: product) {
                                    TransactionRow(transaction: transaction, showsProduct: true)
                                }
                            } else {
                                TransactionRow(transaction: transaction, showsProduct: true)
                            }
                        }
                    }
                }
            }
            .overlay {
                if filtered.isEmpty {
                    ContentUnavailableView("履歴がありません", systemImage: "clock", description: Text("入庫・出庫・棚卸を行うとここに表示されます。"))
                }
            }
            .navigationTitle("入出庫履歴")
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker("種別", selection: $kindFilter) {
                            Text("すべて").tag(TransactionKind?.none)
                            ForEach(TransactionKind.allCases) { kind in
                                Label(kind.label, systemImage: kind.systemImage).tag(TransactionKind?.some(kind))
                            }
                        }
                    } label: {
                        Image(systemName: kindFilter == nil
                              ? "line.3.horizontal.decrease.circle"
                              : "line.3.horizontal.decrease.circle.fill")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(
                        item: CSVExporter.transactions(filtered),
                        preview: SharePreview("入出庫履歴.csv")
                    ) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .disabled(filtered.isEmpty)
                }
            }
        }
    }
}

struct TransactionRow: View {
    let transaction: StockTransaction
    let showsProduct: Bool

    private var deltaColor: Color {
        transaction.delta > 0 ? .green : (transaction.delta < 0 ? .red : .secondary)
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: transaction.kind.systemImage)
                .foregroundStyle(deltaColor)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                if showsProduct {
                    Text(transaction.product?.name ?? "(削除された商品)")
                        .font(.headline)
                        .lineLimit(1)
                }
                HStack(spacing: 6) {
                    Text(transaction.kind.label)
                    Text(transaction.date.formatted(date: showsProduct ? .omitted : .abbreviated, time: .shortened))
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                if !transaction.note.isEmpty {
                    Text(transaction.note)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(transaction.delta, format: .number.sign(strategy: .always(includingZero: false)))
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(deltaColor)
                Text("→ \(transaction.quantityAfter)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    HistoryView()
        .modelContainer(PreviewData.container)
}
