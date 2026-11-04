import SwiftUI
import SwiftData

/// 商品の新規登録・編集画面
struct ProductEditView: View {
    enum Mode {
        case create(barcode: String)
        case edit(Product)
    }

    let mode: Mode
    var onSaved: ((Product) -> Void)?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var barcode = ""
    @State private var name = ""
    @State private var initialQuantity = 0
    @State private var minimumQuantity = 0
    @State private var location = ""
    @State private var note = ""
    @State private var errorMessage: String?
    @State private var isScanningBarcode = false
    @State private var didLoad = false
    @FocusState private var focusedField: Field?

    private enum Field { case barcode, name }

    init(mode: Mode, onSaved: ((Product) -> Void)? = nil) {
        self.mode = mode
        self.onSaved = onSaved
    }

    private var isCreating: Bool {
        if case .create = mode { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("バーコード") {
                    HStack {
                        TextField("JAN / EAN / QR など", text: $barcode)
                            .keyboardType(.asciiCapable)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .focused($focusedField, equals: .barcode)
                        if BarcodeScannerView.isSupported {
                            Button {
                                isScanningBarcode = true
                            } label: {
                                Image(systemName: "barcode.viewfinder")
                            }
                            .buttonStyle(.borderless)
                        }
                    }
                }

                Section("商品情報") {
                    TextField("商品名（必須）", text: $name)
                        .focused($focusedField, equals: .name)
                    TextField("保管場所（例: 棚A-3）", text: $location)
                }

                Section {
                    if isCreating {
                        Stepper(value: $initialQuantity, in: 0...999_999) {
                            LabeledContent("初期在庫数") {
                                TextField("0", value: $initialQuantity, format: .number)
                                    .keyboardType(.numberPad)
                                    .multilineTextAlignment(.trailing)
                                    .frame(maxWidth: 100)
                            }
                        }
                    }
                    Stepper(value: $minimumQuantity, in: 0...999_999) {
                        LabeledContent("最低在庫数") {
                            TextField("0", value: $minimumQuantity, format: .number)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: 100)
                        }
                    }
                } header: {
                    Text("在庫")
                } footer: {
                    Text("在庫数が最低在庫数以下になると「在庫少」として表示されます。0 の場合は警告しません。")
                }

                Section("メモ") {
                    TextField("メモ", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.circle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(isCreating ? "商品を登録" : "商品を編集")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存", action: save)
                        .bold()
                }
            }
            .onAppear(perform: load)
            .sheet(isPresented: $isScanningBarcode) {
                SingleScanSheet { code in
                    barcode = code
                    isScanningBarcode = false
                }
            }
        }
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        switch mode {
        case .create(let code):
            barcode = code
            focusedField = code.isEmpty ? .barcode : .name
        case .edit(let product):
            barcode = product.barcode
            name = product.name
            minimumQuantity = product.minimumQuantity
            location = product.location
            note = product.note
        }
    }

    private func save() {
        do {
            let product = try validateAndSave()
            Haptics.success()
            onSaved?(product)
            dismiss()
        } catch {
            Haptics.error()
            errorMessage = error.localizedDescription
        }
    }

    private func validateAndSave() throws -> Product {
        let code = barcode.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !code.isEmpty else { throw InventoryError.emptyBarcode }
        guard !trimmedName.isEmpty else { throw InventoryError.emptyName }

        let existing = context.product(barcode: code)

        switch mode {
        case .create:
            guard existing == nil else { throw InventoryError.duplicateBarcode }
            let product = Product(
                barcode: code,
                name: trimmedName,
                minimumQuantity: max(0, minimumQuantity),
                location: location.trimmingCharacters(in: .whitespacesAndNewlines),
                note: note
            )
            context.insert(product)
            if initialQuantity > 0 {
                try product.apply(.initial, amount: initialQuantity, in: context)
            } else {
                try context.save()
            }
            return product

        case .edit(let product):
            if let existing, existing.persistentModelID != product.persistentModelID {
                throw InventoryError.duplicateBarcode
            }
            product.barcode = code
            product.name = trimmedName
            product.minimumQuantity = max(0, minimumQuantity)
            product.location = location.trimmingCharacters(in: .whitespacesAndNewlines)
            product.note = note
            product.updatedAt = .now
            try context.save()
            return product
        }
    }
}

/// バーコードを1件だけ読み取って閉じるシート
struct SingleScanSheet: View {
    var onScan: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            BarcodeScannerView(isScanning: true) { code in
                Haptics.success()
                onScan(code)
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle("バーコードを読み取り")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("キャンセル") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    ProductEditView(mode: .create(barcode: "4901234567894"))
        .modelContainer(PreviewData.container)
}
