package expo.modules.pippogramptt

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PippogramPttModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PippogramPtt")

    Function("startForegroundService") {
      val context = appContext.reactContext ?: return@Function
      // For demonstration, we simply log the intention here,
      // a real foreground service requires a separate Android Service class
      // and explicit manifest declarations.
      println("EchoVibe/Pippogram: Starting foreground audio service bypass")
      // val intent = Intent(context, PttForegroundService::class.java)
      // if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      //   context.startForegroundService(intent)
      // } else {
      //   context.startService(intent)
      // }
    }

    Function("initializePttFramework") {
      // iOS specific, no-op on Android
    }
  }
}
