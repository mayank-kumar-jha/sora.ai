package com.sora.ai

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.os.Build
import com.facebook.react.bridge.Arguments
import android.util.Base64
import java.io.ByteArrayOutputStream

class SoraAccessibilityService : AccessibilityService() {

    companion object {
        var instance: SoraAccessibilityService? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i("SoraAccessibility", "Service Connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

    override fun onInterrupt() {}

    fun takeScreenshotQuick() {
        Log.i("SoraAccessibility", "takeScreenshotQuick: Requesting system capture...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            takeScreenshot(Display.DEFAULT_DISPLAY, this.mainExecutor, object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(screenshotResult: AccessibilityService.ScreenshotResult) {
                    Log.i("SoraAccessibility", "Screenshot success! Format: ${screenshotResult.format}")
                    val bitmap = Bitmap.wrapHardwareBuffer(screenshotResult.hardwareBuffer, screenshotResult.colorSpace)
                    if (bitmap != null) {
                        Log.i("SoraAccessibility", "Bitmap wrapped successfully. Encoding...")
                        val base64 = encodeBitmap(bitmap)
                        OverlayModule.sendEventToJS("SCREENSHOT_CAPTURED", Arguments.createMap().apply {
                            putString("base64", base64)
                        })
                    } else {
                        Log.e("SoraAccessibility", "Bitmap wrapping returned null")
                        OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply {
                            putString("error", "BITMAP_WRAP_FAILED")
                        })
                    }
                    OverlayService.instance?.cleanupCapture()
                }

                override fun onFailure(errorCode: Int) {
                    val errorStr = when(errorCode) {
                        AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERNAL_ERROR -> "INTERNAL_ERROR"
                        AccessibilityService.ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS -> "NO_ACCESS"
                        AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TOO_SHORT -> "THROTTLED"
                        AccessibilityService.ERROR_TAKE_SCREENSHOT_INVALID_DISPLAY -> "INVALID_DISPLAY"
                        else -> "UNKNOWN_$errorCode"
                    }
                    Log.e("SoraAccessibility", "Screenshot failed: $errorStr ($errorCode)")
                    OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply {
                        putString("error", "ACCESSIBILITY_FAILURE_$errorStr")
                    })
                    OverlayService.instance?.cleanupCapture()
                }
            })
        } else {
            Log.e("SoraAccessibility", "OS Version too low for takeScreenshot API")
            OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply {
                putString("error", "OS_VERSION_NOT_SUPPORTED")
            })
            OverlayService.instance?.cleanupCapture()
        }
    }


    private fun encodeBitmap(bm: Bitmap): String {
        val out = ByteArrayOutputStream()
        bm.compress(Bitmap.CompressFormat.JPEG, 70, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        instance = null
        return super.onUnbind(intent)
    }
}
