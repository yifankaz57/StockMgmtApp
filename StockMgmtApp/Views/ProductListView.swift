import SwiftUI
import SwiftData

struct ProductListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Product.name) private var products: [Product]

    @State private var searchText = ""
    @State private var showLowStockOnly = false
    @State private var isAddingProduct = false

    private var filteredProducts: [Product] {
        products.filter { product in
            if showLowStockOnly && !product.isLowStock { return false }
            guard !searchText.isEmpty else { return true }
            return product.name.localizedCaseInsensitiveContains(searchText)
                || product.barcode.contains(searchText)
                || product.location.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var lowStockCount: Int {
        products.filter(\.isLowStock).count
    }

    var body: some View {
        NavigationStack {
            List {
                if lowStockCount > 0 && !showLowStockOnly {
                    Section {
                        Button {
                            showLowStockOnly = true
                        } label: {
                            Label("在庫少の商品が \(lowStockCount) 件あります", systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                        }
                    }
                }

                Section {
                    ForEach(filteredProducts) { product in
                        NavigationLink(value: product) {
                            ProductRow(product: product)
                        }
                    }
                    .onDelete(perform: delete)
                } header: {
                    if !products.isEmpty {
                        Text("\(filteredProducts.count) 件")
                    }
                }
            }
            .overlay {
                if products.isEmpty {
                    ContentUnavailableView {
                        Label("商品がありません", systemImage: "shippingbox")
                    } description: {
                        Text("「スキャン」タブでバーコードを読み取るか、右上の＋から商品を登録してください。")
                    }
                } else if filteredProducts.isEmpty {
                    ContentUnavailableView.search(text: searchText)
                }
            }
            .navigationTitle("在庫一覧")
            .navigationDestination(for: Product.self) { product in
                ProductDetailView(product: product)
            }
            .searchable(text: $searchText, prompt: "商品名・バーコード・保管場所")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Toggle(isOn: $showLowStockOnly) {
                            Label("在庫少のみ表示", systemImage: "exclamationmark.triangle")
                        }
                        ShareLink(
                            item: CSVExporter.products(products),
                            preview: SharePreview("在庫一覧.csv")
                        ) {
                            Label("在庫一覧をCSV出力", systemImage: "square.and.arrow.up")
                        }
                    } label: {
                        Image(systemName: showLowStockOnly
                              ? "line.3.horizontal.decrease.circle.fill"
                              : "line.3.horizontal.decrease.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isAddingProduct = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $isAddingProduct) {
                ProductEditView(mode: .create(barcode: ""))
            }
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            context.delete(filteredProducts[index])
        }
        try? context.save()
    }
}

struct ProductRow: View {
    let product: Product

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(product.name)
                    .font(.headline)
                HStack(spacing: 8) {
                    Label(product.barcode, systemImage: "barcode")
                    if !product.location.isEmpty {
                        Label(product.location, systemImage: "mappin.and.ellipse")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
                .lineLimit(1)
            }
            Spacer()
            QuantityBadge(product: product)
        }
    }
}

struct QuantityBadge: View {
    let product: Product

    var body: some View {
        Text("\(product.quantity)")
            .font(.title3.monospacedDigit().bold())
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(product.isLowStock ? .white : .primary)
            .background(
                product.isLowStock ? AnyShapeStyle(Color.orange) : AnyShapeStyle(.fill.tertiary),
                in: Capsule()
            )
            .accessibilityLabel("在庫 \(product.quantity)")
    }
}

#Preview {
    ProductListView()
        .modelContainer(PreviewData.container)
}
