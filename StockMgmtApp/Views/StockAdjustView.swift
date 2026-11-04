import SwiftUI
import SwiftData

/// 入庫・出庫・棚卸を行うシート
struct StockAdjustView: View {
    let product: Product
    @State var kind: TransactionKind

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var amount = 1
    @State private var note = ""
    @State private var errorMessage: String?
    @State private var isEditingProduct = false

    static let selectableKinds: [TransactionKind] = [.stockIn, .stockOut, .adjustment]

    init(product: Product, kind: TransactionKind = .stockIn) {
        self.product = product
        self._kind = State(initialValue: kind)
    }

    private var preview: Result<Int, Error> {
        Result { try InventoryCalculator.result(current: product.quantity, kind: kind, amount: amount).newQuantity }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(product.name)
                            .font(.title3.bold())
                        Label(product.barcode, systemImage: "barcode")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        if !product.location.isEmpty {
                            Label(product.location, systemImage: "mappin.and.ellipse")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    LabeledContent("現在の在庫") {
                        QuantityBadge(product: product)
                    }
                }

                Section {
                    Picker("操作", selection: $kind) {
                        ForEach(Self.selectableKinds) { kind in
                            Label(kind.label, systemImage: kind.systemImage).tag(kind)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section {
                    HStack {
                        Text(kind == .adjustment ? "実在庫数" : "数量")
                        Spacer()
                        quantityControl
                    }
                    if kind != .adjustment {
                        HStack {
                            ForEach([1, 5, 10, 50], id: \.self) { step in
                                Button("+\(step)") { amount += step }
                                    .buttonStyle(.bordered)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                    TextField("メモ（任意）", text: $note)
                } footer: {
                    resultFooter
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(kind.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("確定", action: commit)
                        .bold()
                        .disabled((try? preview.get()) == nil)
                }
                ToolbarItem(placement: .bottomBar) {
                    Button {
                        isEditingProduct = true
                    } label: {
                        Label("商品情報を編集", systemImage: "pencil")
                    }
                }
            }
            .onChange(of: kind) { _, newKind in
                errorMessage = nil
                amount = newKind == .adjustment ? product.quantity : 1
            }
            .sheet(isPresented: $isEditingProduct) {
                ProductEditView(mode: .edit(product))
            }
        }
        .presentationDetents([.medium, .large])
    }

    private var quantityControl: some View {
        HStack(spacing: 12) {
            Button {
                amount = max(kind == .adjustment ? 0 : 1, amount - 1)
            } label: {
                Image(systemName: "minus.circle.fill").font(.title2)
            }
            .buttonStyle(.borderless)

            TextField("0", value: $amount, format: .number)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.title2.monospacedDigit().bold())
                .frame(width: 90)

            Button {
                amount += 1
            } label: {
                Image(systemName: "plus.circle.fill").font(.title2)
            }
            .buttonStyle(.borderless)
        }
    }

    @ViewBuilder
    private var resultFooter: some View {
        switch preview {
        case .success(let newQuantity):
            Text("確定後の在庫: \(product.quantity) → \(newQuantity)")
                .font(.callout.monospacedDigit())
        case .failure(let error):
            Text(error.localizedDescription)
                .foregroundStyle(.red)
        }
    }

    private func commit() {
        do {
            try product.apply(kind, amount: amount, note: note, in: context)
            Haptics.success()
            dismiss()
        } catch {
            Haptics.error()
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    StockAdjustView(product: PreviewData.sampleProduct, kind: .stockIn)
        .modelContainer(PreviewData.container)
}
