import SwiftUI
import SwiftData

/// カメラでバーコードを読み取り、在庫操作へつなげる画面
struct ScanView: View {
    /// タブが選択されているか（非表示中はカメラを止める）
    var isActive: Bool

    enum ScanMode: String, CaseIterable, Identifiable {
        case lookup, quickIn, quickOut
        var id: String { rawValue }
        var label: String {
            switch self {
            case .lookup: "照会・操作"
            case .quickIn: "連続入庫 +1"
            case .quickOut: "連続出庫 −1"
            }
        }
    }

    enum ActiveSheet: Identifiable {
        case adjust(Product)
        case register(String)

        var id: String {
            switch self {
            case .adjust(let product): "adjust-\(product.barcode)"
            case .register(let code): "register-\(code)"
            }
        }
    }

    struct Banner: Equatable {
        let id = UUID()
        let message: String
        let isError: Bool
    }

    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase

    @AppStorage("scanMode") private var mode: ScanMode = .lookup
    @State private var activeSheet: ActiveSheet?
    @State private var cameraStatus = CameraPermission.status
    @State private var isEnteringManually = false
    @State private var manualCode = ""
    @State private var banner: Banner?

    private var isScanning: Bool {
        isActive && scenePhase == .active && activeSheet == nil && !isEnteringManually
    }

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                scannerArea
                    .ignoresSafeArea(edges: .horizontal)

                VStack(spacing: 12) {
                    if let banner {
                        bannerView(banner)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    controls
                }
                .padding()
                .animation(.spring(duration: 0.3), value: banner)
            }
            .navigationTitle("スキャン")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        manualCode = ""
                        isEnteringManually = true
                    } label: {
                        Label("手入力", systemImage: "keyboard")
                    }
                }
            }
            .alert("バーコードを入力", isPresented: $isEnteringManually) {
                TextField("バーコード", text: $manualCode)
                    .keyboardType(.asciiCapable)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("キャンセル", role: .cancel) {}
                Button("検索") {
                    let code = manualCode.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !code.isEmpty { handleScan(code) }
                }
            }
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .adjust(let product):
                    StockAdjustView(product: product, kind: .stockIn)
                case .register(let code):
                    ProductEditView(mode: .create(barcode: code)) { product in
                        showBanner("「\(product.name)」を登録しました（在庫 \(product.quantity)）", isError: false)
                    }
                }
            }
            .task {
                if cameraStatus == .notDetermined {
                    cameraStatus = await CameraPermission.request()
                }
            }
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var scannerArea: some View {
        if !BarcodeScannerView.isSupported {
            unavailableView(
                title: "この端末ではスキャンできません",
                message: "カメラでのバーコード読み取りには A12 Bionic 以降を搭載した iPhone が必要です。右上の「手入力」からバーコードを入力できます。"
            )
        } else {
            switch cameraStatus {
            case .authorized:
                BarcodeScannerView(isScanning: isScanning, onScan: handleScan)
            case .notDetermined:
                ProgressView("カメラを準備中…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .denied:
                unavailableView(
                    title: "カメラへのアクセスが許可されていません",
                    message: "設定アプリでカメラへのアクセスを許可してください。",
                    showSettings: true
                )
            }
        }
    }

    private func unavailableView(title: String, message: String, showSettings: Bool = false) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: "camera.metering.unknown")
        } description: {
            Text(message)
        } actions: {
            if showSettings, let url = URL(string: UIApplication.openSettingsURLString) {
                Button("設定を開く") { UIApplication.shared.open(url) }
                    .buttonStyle(.borderedProminent)
            }
            Button("バーコードを手入力") {
                manualCode = ""
                isEnteringManually = true
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var controls: some View {
        VStack(spacing: 8) {
            Picker("モード", selection: $mode) {
                ForEach(ScanMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            Text(modeDescription)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private var modeDescription: String {
        switch mode {
        case .lookup: "読み取った商品の入庫・出庫・棚卸を行います。未登録なら登録画面を開きます。"
        case .quickIn: "読み取るたびに在庫を 1 増やします。"
        case .quickOut: "読み取るたびに在庫を 1 減らします。"
        }
    }

    private func bannerView(_ banner: Banner) -> some View {
        Label(banner.message, systemImage: banner.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            .font(.callout.bold())
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(banner.isError ? Color.red : Color.green, in: RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Actions

    private func handleScan(_ code: String) {
        guard let product = context.product(barcode: code) else {
            Haptics.warning()
            activeSheet = .register(code)
            return
        }

        switch mode {
        case .lookup:
            Haptics.success()
            activeSheet = .adjust(product)
        case .quickIn:
            quickApply(.stockIn, to: product, sign: "+1")
        case .quickOut:
            quickApply(.stockOut, to: product, sign: "−1")
        }
    }

    private func quickApply(_ kind: TransactionKind, to product: Product, sign: String) {
        do {
            try product.apply(kind, amount: 1, note: "連続スキャン", in: context)
            Haptics.success()
            showBanner("\(product.name) \(sign)　→ 在庫 \(product.quantity)", isError: false)
        } catch {
            Haptics.error()
            showBanner("\(product.name): \(error.localizedDescription)", isError: true)
        }
    }

    private func showBanner(_ message: String, isError: Bool) {
        let newBanner = Banner(message: message, isError: isError)
        banner = newBanner
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.5))
            if banner?.id == newBanner.id {
                banner = nil
            }
        }
    }
}

#Preview {
    ScanView(isActive: true)
        .modelContainer(PreviewData.container)
}
