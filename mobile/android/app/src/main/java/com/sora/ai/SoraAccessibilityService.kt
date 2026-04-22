package com.sora.ai

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.graphics.ColorSpace
import android.hardware.HardwareBuffer
import android.os.Build
import android.util.Base64
import android.util.Log
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import java.io.ByteArrayOutputStream
import com.facebook.react.bridge.Arguments

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

    private var lastScreenshotTime: Long = 0

    fun takeScreenshotQuick() {
        val now = System.currentTimeMillis()
        val elapsed = now - lastScreenshotTime
        if (elapsed < 1000) {
            Log.w("SoraAccessibility", "Screenshot requested too soon (${elapsed}ms). Throttling gracefully...")
            // Delay by the remainder of the 1000ms cooldown + 50ms buffer to ensure Android OS allows it
            val delay = 1000 - elapsed + 50
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                takeScreenshotQuick()
            }, delay)
            return
        }
        lastScreenshotTime = now
        
        Log.i("SoraAccessibility", "takeScreenshotQuick: Requesting system capture...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            takeScreenshot(Display.DEFAULT_DISPLAY, this.mainExecutor, object : AccessibilityService.TakeScreenshotCallback {
                override fun onSuccess(screenshotResult: AccessibilityService.ScreenshotResult) {
                    Log.i("SoraAccessibility", "Screenshot success!")
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
                        1 -> "INTERNAL_ERROR" // ERROR_TAKE_SCREENSHOT_INTERNAL_ERROR
                        2 -> "NO_ACCESS"      // ERROR_TAKE_SCREENSHOT_NO_ACCESSIBILITY_ACCESS
                        3 -> "THROTTLED"      // ERROR_TAKE_SCREENSHOT_INTERVAL_TOO_SHORT (API 31+)
                        4 -> "INVALID_DISPLAY" // ERROR_TAKE_SCREENSHOT_INVALID_DISPLAY (API 31+)
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
