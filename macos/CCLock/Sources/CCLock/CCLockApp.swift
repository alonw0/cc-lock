import SwiftUI

@main
struct CCLockApp: App {
    @StateObject private var viewModel = MenuBarViewModel()

    var body: some Scene {
        MenuBarExtra {
            MenuBarView(viewModel: viewModel)
                .task {
                    viewModel.startPolling()
                }
        } label: {
            Image(systemName: menuBarIcon)
        }
        .menuBarExtraStyle(.window)
    }

    private var menuBarIcon: String {
        if !viewModel.connected {
            return "exclamationmark.circle"
        }
        switch viewModel.lock.status {
        case .unlocked:
            return "lock.open"
        case .locked:
            return "lock.fill"
        case .grace:
            return "lock.shield"
        }
    }
}
