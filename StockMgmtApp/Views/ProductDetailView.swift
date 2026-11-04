import SwiftUI
import SwiftData

struct ProductDetailView: View {
    let product: Product

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var adjustKind: TransactionKind?
    @State private var isEditing = false
    @State private var isConfirmingDelete = false

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    Text("\(product.quantity)")
                        .font(.system(size: 56, weight: .bold, design: .rounded).monospacedDigit())
                        .foregroundStyle(product.isLowStock ? .orange : .primary)
                    Text("現在の在庫数")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if product.isLowStock {
                        Label("最低在庫数（\(product.minimumQuantity)）以下です", systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote.bold())
                            .foregroundStyle(.orange)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)

                HStack(spacing: 12) {
                    ForEach(StockAdjustView.selectableKinds) { kind in
                        Button {
                            adjustKind = kind
                        } label: {
                            VStack(spacing: 4) {
                                Image(systemName: kind.systemImage).font(.title3)
                                Text(kind.label).font(.caption.bold())
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }

            Section("商品情報") {
                LabeledContent("バーコード", value: product.barcode)
                    .textSelection(.enabled)
                if !product.location.isEmpty {
                    LabeledContent("保管場所", value: product.location)
                }
                LabeledContent("最低在庫数", value: "\(product.minimumQuantity)")
                LabeledContent("登録日", value: product.createdAt.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("更新日", value: product.updatedAt.formatted(date: .abbreviated, time: .shortened))
                if !product.note.isEmpty {
                    Text(product.note)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            Section("入出庫履歴") {
                let transactions = product.sortedTransactions
                if transactions.isEmpty {
                    Text("履歴はありません")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(transactions) { transaction in
                        TransactionRow(transaction: transaction, showsProduct: false)
                    }
                }
            }

            Section {
                Button("この商品を削除", role: .destructive) {
                    isConfirmingDelete = true
                }
            }
        }
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button("編集") { isEditing = true }
        }
        .sheet(item: $adjustKind) { kind in
            StockAdjustView(product: product, kind: kind)
        }
        .sheet(isPresented: $isEditing) {
            ProductEditView(mode: .edit(product))
        }
        .confirmationDialog("「\(product.name)」を削除しますか？", isPresented: $isConfirmingDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                // 表示中のモデルを削除するとクラッシュすることがあるため、画面を閉じてから削除する
                let target = product
                dismiss()
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(400))
                    context.delete(target)
                    try? context.save()
                }
            }
        } message: {
            Text("入出庫履歴もすべて削除されます。この操作は取り消せません。")
        }
    }
}

#Preview {
    NavigationStack {
        ProductDetailView(product: PreviewData.sampleProduct)
    }
    .modelContainer(PreviewData.container)
}
