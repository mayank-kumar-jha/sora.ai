package com.sora.ai

import android.content.Intent
import android.provider.Settings
import android.net.Uri
import android.app.Activity
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class OverlayModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        var instance: OverlayModule? = null
        private const val SCREEN_CAPTURE_PERMISSION_CODE = 2002
        
        // Initial actions from background triggers
        var initialAction: String? = null
        var initialVisionTranscript: String? = null
        
        fun sendEventToJS(eventName: String, params: WritableMap?) {
            instance?.reactApplicationContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit(eventName, params)
        }
    }

    init {
        instance = this
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "SoraOverlay"

    @ReactMethod
    fun startOverlay(eyeColor: String?) {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "start")
            putExtra("color", eyeColor)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun stopOverlay() {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "stop")
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun hideOverlay() {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "hide")
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun updateState(state: String) {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "updateState")
            putExtra("state", state)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun updateColor(color: String) {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "updateColor")
            putExtra("color", color)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun addMessage(message: String, sender: String) {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "addMessage")
            putExtra("message", message)
            putExtra("sender", sender)
        }
        reactApplicationContext.startService(intent)
    }

    @ReactMethod
    fun hasPermission(promise: Promise) {
        val canDraw = Settings.canDrawOverlays(reactApplicationContext)
        promise.resolve(canDraw)
    }

    @ReactMethod
    fun requestPermission() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${reactApplicationContext.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun openAccessibilitySettings() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun hasAccessibilityPermission(promise: Promise) {
        try {
            val enabledServices = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )
            val isEnabled = enabledServices?.contains(reactApplicationContext.packageName + "/.SoraAccessibilityService") == true
            promise.resolve(isEnabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestScreenCapturePermission() {
        val activity = currentActivity
        if (activity == null) {
            Log.e("SoraOverlay", "requestScreenCapturePermission: No activity")
            return
        }
        val manager = reactApplicationContext.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        activity.startActivityForResult(manager.createScreenCaptureIntent(), SCREEN_CAPTURE_PERMISSION_CODE)
    }

    @ReactMethod
    fun takeScreenshot() {
        OverlayService.instance?.takeScreenshot()
    }
    
    @ReactMethod
    fun resetVisionCapture() {
        Log.i("SoraOverlay", "Resetting Vision Capture requested from JS")
        OverlayService.instance?.clearPendingScreenshot()
        // Force stop of persistent projection if it's acting up
        OverlayService.persistentProjection?.let {
            try { it.stop() } catch (e: Exception) { Log.e("SoraOverlay", "Failed to stop projection", e) }
        }
        OverlayService.persistentProjection = null
        OverlayService.instance?.cleanupCapture()
    }

    @ReactMethod
    fun relaunchApp() {
        val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(reactApplicationContext.packageName)
        intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        reactApplicationContext.startActivity(intent)
        // Ensure we kill the current process to force a fresh JS load if needed
        android.os.Process.killProcess(android.os.Process.myPid())
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(OverlayService.instance != null)
    }

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == SCREEN_CAPTURE_PERMISSION_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null) {
                Log.i("SoraOverlay", "Screen capture permission GRANTED")
                OverlayService.instance?.startScreenCapture(resultCode, data)
            } else {
                Log.e("SoraOverlay", "Screen capture permission DENIED or FAILED (resultCode: $resultCode)")
                OverlayService.instance?.clearPendingScreenshot()
                sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply { putString("error", "PERMISSION_DENIED_BY_USER") })
            }
        }
    }

    @ReactMethod
    fun getInitialAction(promise: Promise) {
        promise.resolve(initialAction)
        initialAction = null
    }

    @ReactMethod
    fun getVisionTranscript(promise: Promise) {
        promise.resolve(initialVisionTranscript)
        initialVisionTranscript = null
    }

    @ReactMethod
    fun setVisionTranscript(transcript: String?) {
        initialVisionTranscript = transcript
    }

    @ReactMethod
    fun updateIsCapturing(isCapturing: Boolean) {
        // Legacy: keep for bridge compatibility
    }

    @ReactMethod
    fun updateEyeColor(color: String) {
        val intent = Intent(reactApplicationContext, OverlayService::class.java).apply {
            putExtra("action", "updateColor")
            putExtra("color", color)
        }
        reactApplicationContext.startService(intent)
    }

    override fun onNewIntent(intent: Intent?) {}
}
