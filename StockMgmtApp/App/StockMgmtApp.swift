import SwiftUI
import SwiftData

@main
struct StockMgmtApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Product.self, StockTransaction.self])
    }
}
