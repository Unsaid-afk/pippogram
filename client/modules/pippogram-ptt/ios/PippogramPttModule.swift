import ExpoModulesCore

public class PippogramPttModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PippogramPtt")

    Events("onPttIncoming")

    Function("initializePttFramework") {
      // In a real implementation with Apple Developer Entitlements:
      // PTChannelManager.makeManager(delegate: self, restorationDelegate: self) { result in ... }
      print("EchoVibe/Pippogram: Initialized iOS Push-to-Talk framework bypass")
    }

    Function("startForegroundService") {
      // Android specific, no-op on iOS
    }
  }
}
