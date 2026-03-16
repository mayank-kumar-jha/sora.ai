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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(screenshotResult: ScreenshotResult) {
                    val bitmap = Bitmap.wrapHardwareBuffer(screenshotResult.hardwareBuffer, screenshotResult.colorSpace)
                    if (bitmap != null) {
                        val base64 = encodeBitmap(bitmap)
                        OverlayModule.sendEventToJS("SCREENSHOT_CAPTURED", Arguments.createMap().apply {
                            putString("base64", base64)
                        })
                    }
                    OverlayService.instance?.cleanupCapture()
                }

                override fun onFailure(errorCode: Int) {
                    Log.e("SoraAccessibility", "Screenshot failed: $errorCode")
                    OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply {
                        putString("error", "ACCESSIBILITY_FAILURE_$errorCode")
                    })
                    OverlayService.instance?.cleanupCapture()
                }
            })
        } else {
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
