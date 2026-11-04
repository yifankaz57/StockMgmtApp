import SwiftUI

struct ContentView: View {
    enum Tab: Hashable { case products, scan, history }

    @State private var selection: Tab = .scan

    var body: some View {
        TabView(selection: $selection) {
            ProductListView()
                .tabItem { Label("在庫一覧", systemImage: "shippingbox") }
                .tag(Tab.products)

            ScanView(isActive: selection == .scan)
                .tabItem { Label("スキャン", systemImage: "barcode.viewfinder") }
                .tag(Tab.scan)

            HistoryView()
                .tabItem { Label("履歴", systemImage: "clock.arrow.circlepath") }
                .tag(Tab.history)
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(PreviewData.container)
}
