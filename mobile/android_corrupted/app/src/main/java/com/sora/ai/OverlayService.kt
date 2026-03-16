package com.sora.ai

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.util.Log
import android.view.*
import android.os.*
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import android.view.animation.AccelerateDecelerateInterpolator
import android.animation.ValueAnimator
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import android.media.MediaRecorder
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import android.provider.Settings
import android.content.SharedPreferences
import android.content.ComponentName

/**
 * OverlayService: A robust, state-driven service for Sora's floating UI.
 * Redesigned for Android 14 stability and event-driven communication.
 */
class OverlayService : Service() {

    enum class OverlayState {
        IDLE, LISTENING, THINKING, SPEAKING, CAPTURING
    }

    enum class SoraSize {
        COMPACT, MINI, HALF
    }

    companion object {
        internal const val TAG = "SoraOverlay"
        internal const val CHANNEL_ID = "sora_overlay_channel"
        internal const val NOTIFICATION_ID = 2001
        var instance: OverlayService? = null
        
        // NUCLEAR PERSISTENCE: Maintain the projection session at the process level
        internal var persistentProjection: MediaProjection? = null
        internal var lastResultCode: Int = 0
        internal var lastResultData: Intent? = null
    }

    private var windowManager: WindowManager? = null
    private var container: LinearLayout? = null
    private var eyesView: SoraEyesView? = null
    private var waveformView: SoraWaveformView? = null
    private var contentWrap: LinearLayout? = null
    private var bubblesContainer: LinearLayout? = null
    private var layoutParams: WindowManager.LayoutParams? = null
    
    // Controls
    private var micBtn: View? = null
    private var micIcon: View? = null
    private var maximizeBtn: View? = null
    private var maximizeIcon: View? = null
    private var mainContent: LinearLayout? = null
    private var leftPanel: LinearLayout? = null

    // State
    private var currentState = OverlayState.IDLE
    private var currentSize = SoraSize.COMPACT
    private var themeColor = Color.parseColor("#00ddff")
    private val iconViews = mutableListOf<View>()
    
    // Screen Capture (Nuclear R4 Refactor)
    private var mediaProjection: MediaProjection? get() = OverlayService.persistentProjection; set(value) { OverlayService.persistentProjection = value }
    private var imageReader: ImageReader? = null
    private var virtualDisplay: VirtualDisplay? = null
    
    private var isProcessingCapture = false
    private var pendingScreenshot = false
    var pendingVisionTranscript: String? = null
    
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var captureThread: android.os.HandlerThread? = null
    private var captureHandler: android.os.Handler? = null
    private var captureWatchdog: Runnable? = null
    
    // Native Recording
    private var mediaRecorder: MediaRecorder? = null
    private var currentAudioFile: File? = null
    private var isRecording = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        
        // Background thread for non-UI work (capture, processing)
        captureThread = android.os.HandlerThread("SoraCaptureThread").apply { start() }
        captureHandler = android.os.Handler(captureThread!!.looper)
        
        loadProjectionToken()
        createNotificationChannel()
        startSafeForeground()
        setupOverlayWindow()
        Log.i(OverlayService.TAG, "Service Overhauled (R3 Persistence): Ready")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.let { handleCommand(it) }
        return START_STICKY
    }

    private fun handleCommand(intent: Intent) {
        when (intent.getStringExtra("action")) {
            "start" -> {
                intent.getStringExtra("color")?.let { updateColor(it) }
                setupOverlayWindow()
            }
            "updateState" -> updateState(intent.getStringExtra("state"))
            "updateColor" -> updateColor(intent.getStringExtra("color"))
            "addMessage" -> addMessage(intent.getStringExtra("message"), intent.getStringExtra("sender"))
            "hide" -> removeOverlay()
            "stop" -> shutdown()
        }
    }

    private fun startSafeForeground() {
        val notification = buildNotification("Sora is active")
        try {
            // Android 14: Start with basic types, upgrade dynamically
            val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            startForeground(OverlayService.NOTIFICATION_ID, notification, type)
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "FGS start failed", e)
            startForeground(OverlayService.NOTIFICATION_ID, notification)
        }
    }

    private fun setupOverlayWindow() {
        if (container != null) {
            // Already initialized, just ensure it's attached and visible
            Log.d(OverlayService.TAG, "Overlay already initialized, checking attachment...")
            mainHandler.post {
                try {
                    if (container?.parent == null) {
                        windowManager?.addView(container, layoutParams)
                    } else {
                        windowManager?.updateViewLayout(container, layoutParams)
                    }
                } catch (e: Exception) {
                    Log.e(OverlayService.TAG, "Failed to update/add existing overlay window", e)
                }
            }
            return
        }

        Log.i(OverlayService.TAG, "Initializing Overlay UI for the first time")
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val density = resources.displayMetrics.density

        container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.argb(230, 24, 24, 28), Color.argb(245, 12, 12, 14))
            ).apply {
                cornerRadius = 24 * density
                setStroke((1.2 * density).toInt(), Color.argb(45, 255, 255, 255))
            }
            setOnTouchListener(createTouchListener())
        }

        val wrap = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        }
        contentWrap = wrap

        val lp = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams((48 * density).toInt(), WRAP_CONTENT)
        }
        leftPanel = lp
        
        eyesView = SoraEyesView(this).apply {
            layoutParams = LinearLayout.LayoutParams((48 * density).toInt(), (48 * density).toInt())
            eyeColor = this@OverlayService.themeColor
        }
        lp.addView(eyesView)

        waveformView = SoraWaveformView(this).apply {
            layoutParams = LinearLayout.LayoutParams((38 * density).toInt(), (20 * density).toInt()).apply { topMargin = (8 * density).toInt() }
            color = this@OverlayService.themeColor
            visibility = View.GONE
        }
        lp.addView(waveformView)
        wrap.addView(lp)

        val mc = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        }
        mainContent = mc

        bubblesContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
            setPadding((10 * density).toInt(), (10 * density).toInt(), 0, 0)
        }
        val scroller = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, MATCH_PARENT, 1f)
            isVerticalScrollBarEnabled = false
            isFillViewport = true
            addView(bubblesContainer)
        }
        mc.addView(scroller)

        val controls = createControlPanel(density)
        mc.addView(controls)
        wrap.addView(mc)
        container?.addView(wrap)

        layoutParams = WindowManager.LayoutParams(
            (100 * density).toInt(), (40 * density).toInt(),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = (10 * density).toInt()
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Log.e(OverlayService.TAG, "Cannot setup overlay: SYSTEM_ALERT_WINDOW permission missing")
            return
        }

        mainHandler.post {
            try {
                if (container?.parent == null) {
                    windowManager?.addView(container, layoutParams)
                    Log.i(OverlayService.TAG, "Overlay window added successfully")
                }
            } catch (e: Exception) {
                Log.e(OverlayService.TAG, "Failed to add initial overlay window", e)
            }
        }
    }

    private fun createControlPanel(density: Float): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams((60 * density).toInt(), MATCH_PARENT)
            setPadding(0, (10 * density).toInt(), (5 * density).toInt(), (10 * density).toInt())

            addView(createIcon("OPEN", "#00ddff") { openApp() })
            maximizeBtn = createIcon("MAXIMIZE", "#00ddff") { toggleMaximize() }
            maximizeIcon = (maximizeBtn as? FrameLayout)?.getChildAt(0)
            addView(maximizeBtn)
            
            // Flexible spacer to separate Open and Mic
            addView(View(this@OverlayService).apply { 
                layoutParams = LinearLayout.LayoutParams(1, 0, 1f) 
            })
            
            micBtn = createIcon("MIC", "#00ddff") { triggerMic() }
            addView(micBtn)
        }
    }

    private fun createIcon(type: String, baseColor: String, onClick: () -> Unit): View {
        val density = resources.displayMetrics.density
        val size = (40 * density).toInt()
        val frame = android.widget.FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(size, size).apply { bottomMargin = (10 * density).toInt() }
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(128, 40, 40, 40)) // Translucent button bg
                setStroke((1 * density).toInt(), Color.argb(25, 255, 255, 255))
            }
            setOnClickListener { onClick() }
        }

        val icon = object : View(this) {
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                strokeWidth = 2f * density
                strokeCap = android.graphics.Paint.Cap.ROUND
                strokeJoin = android.graphics.Paint.Join.ROUND
            }

            override fun onDraw(c: android.graphics.Canvas) {
                paint.color = themeColor
                val cx = width / 2f; val cy = height / 2f
                val d = density
                when (type) {
                    "OPEN" -> {
                        // Arrow pointing up-right (launch icon)
                        paint.style = android.graphics.Paint.Style.STROKE
                        val s = 7 * d
                        // Box
                        val path = android.graphics.Path()
                        path.moveTo(cx - s, cy - s + 3*d)
                        path.lineTo(cx - s, cy + s)
                        path.lineTo(cx + s - 3*d, cy + s)
                        c.drawPath(path, paint)
                        // Arrow
                        c.drawLine(cx - s + 2*d, cy + s - 2*d, cx + s, cy - s, paint)
                        c.drawLine(cx + s, cy - s, cx + s - 4*d, cy - s, paint)
                        c.drawLine(cx + s, cy - s, cx + s, cy - s + 4*d, paint)
                    }
                    "EYE" -> {
                        // Eye shape with pupil
                        paint.style = android.graphics.Paint.Style.STROKE
                        val ew = 9 * d; val eh = 5 * d
                        val path = android.graphics.Path()
                        // Top arc
                        path.moveTo(cx - ew, cy)
                        path.quadTo(cx, cy - eh * 1.8f, cx + ew, cy)
                        // Bottom arc
                        path.quadTo(cx, cy + eh * 1.8f, cx - ew, cy)
                        path.close()
                        c.drawPath(path, paint)
                        // Pupil (filled)
                        paint.style = android.graphics.Paint.Style.FILL
                        c.drawCircle(cx, cy, 3.5f * d, paint)
                    }
                    "MIC" -> {
                        // Microphone shape
                        paint.style = android.graphics.Paint.Style.STROKE
                        val mw = 3.5f * d; val mh = 5 * d
                        // Mic body (rounded rect approximation)
                        val rect = android.graphics.RectF(cx - mw, cy - mh - 1*d, cx + mw, cy + 1*d)
                        c.drawRoundRect(rect, mw, mw, paint)
                        // Mic cup below
                        val cupRect = android.graphics.RectF(cx - mw - 2*d, cy - 2*d, cx + mw + 2*d, cy + 4*d)
                        c.drawArc(cupRect, 0f, 180f, false, paint)
                        // Stand line
                        c.drawLine(cx, cy + 4*d, cx, cy + 7*d, paint)
                        // Base
                        c.drawLine(cx - 3*d, cy + 7*d, cx + 3*d, cy + 7*d, paint)
                    }
                    "MAXIMIZE" -> {
                        paint.style = android.graphics.Paint.Style.STROKE
                        val s = 6 * d
                        if (currentSize != SoraSize.HALF) {
                            // Maximize icon
                            c.drawRect(cx - s, cy - s, cx + s, cy + s, paint)
                            c.drawLine(cx - s, cy - s + 3*d, cx - s + 3*d, cy - s, paint)
                            c.drawLine(cx + s, cy + s - 3*d, cx + s - 3*d, cy + s, paint)
                        } else {
                            // Minimize icon
                            c.drawRect(cx - s + 2*d, cy - s + 2*d, cx + s - 2*d, cy + s - 2*d, paint)
                        }
                    }
                }
            }
        }
        if (type == "MIC") micIcon = icon
        iconViews.add(icon)
        frame.addView(icon)
        return frame
    }

    /**
     * CENTRAL STATE MACHINE
     * All UI updates must flow through here.
     */
    fun updateState(stateStr: String?) {
        val state = when (stateStr?.lowercase()) {
            "listening" -> OverlayState.LISTENING
            "thinking" -> OverlayState.THINKING
            "speaking" -> OverlayState.SPEAKING
            "capturing" -> OverlayState.CAPTURING
            else -> OverlayState.IDLE
        }
        mainHandler.post { applyState(state) }
    }

    fun clearPendingScreenshot() {
        pendingScreenshot = false
        isProcessingCapture = false
        pendingVisionTranscript = null
        Log.i(OverlayService.TAG, "Vision capture state reset (locks cleared)")
    }

    private fun applyState(state: OverlayState) {
        Log.i(OverlayService.TAG, "State Transition: $currentState -> $state")
        currentState = state
        
        // 1. Update Eyes
        eyesView?.eyeState = when(state) {
            OverlayState.LISTENING -> "Listening"
            OverlayState.THINKING -> "Thinking"
            OverlayState.SPEAKING -> "Speaking"
            else -> "Idle"
        }

        // 2. Update Waveform
        waveformView?.visibility = if (state == OverlayState.LISTENING || state == OverlayState.SPEAKING) View.VISIBLE else View.GONE
        waveformView?.isAnimating = (state == OverlayState.LISTENING || state == OverlayState.SPEAKING)

        // 3. Update Mic Button Color
        val micBG = micBtn?.background as? GradientDrawable
        if (state == OverlayState.LISTENING) {
            micBG?.setColor(Color.parseColor("#ff3b30"))
        } else {
            micBG?.setColor(Color.parseColor("#222222"))
        }

        // 4. Manage Foreground Service Types (Android 14)
        syncForegroundType()
    }

    private fun syncForegroundType() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        
        // Base types always required for a voice assistant
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or 
                   ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                   
        // DATA_SYNC is required for background networking on Android 14+ to avoid suspension
        if (currentState != OverlayState.IDLE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            }
        }

        // Nuclear R4: Media projection MUST be explicitly active for capture to work on A14
        if (currentState == OverlayState.CAPTURING || isProcessingCapture || pendingScreenshot) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        }

        Log.i(OverlayService.TAG, "Atomic FGS Sync: type=$type, state=$currentState")
        try {
            // Android 14 requires a fresh startForeground call to update types
            startForeground(OverlayService.NOTIFICATION_ID, buildNotification("Sora: ${currentState.name}"), type)
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "FGS Sync Failed", e)
        }
    }

    private fun triggerMic() {
        if (isRecording) {
            stopNativeRecording()
        } else {
            startNativeRecording()
        }
    }

    private fun startNativeRecording() {
        Log.i(OverlayService.TAG, "startNativeRecording: Initializing MediaRecorder")
        
        // 1. Android 14 Guard: Check Permission first
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(OverlayService.TAG, "RECORD_AUDIO permission not granted!")
            OverlayModule.sendEventToJS("RECORDING_ERROR", Arguments.createMap().apply { putString("error", "PERMISSION_DENIED") })
            // Auto-launch app to request permission if needed
            openApp()
            return
        }

        // 2. Android 14 Guard: Sync Foreground Service Type BEFORE starting recording
        // We must transition to MICROPHONE type now to satisfy system enforcement
        applyState(OverlayState.LISTENING)
        
        val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val fileName = "Sora_Recording_$timestamp.m4a"
        currentAudioFile = File(externalCacheDir, fileName)

        try {
            mediaRecorder = (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(this) else MediaRecorder()).apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16000)
                setAudioEncodingBitRate(128000)
                setOutputFile(currentAudioFile?.absolutePath)
                prepare()
                
                // Final safety check before start
                try {
                    start()
                } catch (se: SecurityException) {
                    Log.e(OverlayService.TAG, "SecurityException: OS rejected mic access. Service type sync might have failed.", se)
                    throw se
                }
            }
            isRecording = true
            Log.i(OverlayService.TAG, "Native recording started: ${currentAudioFile?.absolutePath}")
            
            // Auto-stop after 15 seconds to be safe
            mainHandler.postDelayed({
                if (isRecording) {
                    Log.i(OverlayService.TAG, "Native recording auto-stop timeout reached")
                    stopNativeRecording()
                }
            }, 15000)
            
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Failed to start native recording", e)
            isRecording = false
            applyState(OverlayState.IDLE)
            OverlayModule.sendEventToJS("RECORDING_ERROR", Arguments.createMap().apply { putString("error", "START_FAILED") })
        }
    }

    private fun stopNativeRecording() {
        if (!isRecording) return
        Log.i(OverlayService.TAG, "stopNativeRecording: Stopping...")
        
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            mediaRecorder = null
            isRecording = false
            applyState(OverlayState.THINKING)
            
            val filePath = currentAudioFile?.absolutePath
            if (filePath != null) {
                Log.i(OverlayService.TAG, "Native recording stopped. File: $filePath")
                OverlayModule.sendEventToJS("RECORDING_FINISHED", Arguments.createMap().apply { 
                    putString("uri", "file://$filePath")
                })
            }
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Failed to stop native recording", e)
            OverlayModule.sendEventToJS("RECORDING_ERROR", Arguments.createMap().apply { putString("error", "STOP_FAILED") })
        } finally {
            isRecording = false
            if (currentState == OverlayState.LISTENING) applyState(OverlayState.IDLE)
        }
    }

    private fun triggerVision() {
        Log.i(OverlayService.TAG, "triggerVision: UI Vision button pressed or requested")
        // Proactively upgrade FGS type to prepare for background capture
        // Android 14 requires the type to be active BEFORE the activity result comes back
        currentState = OverlayState.CAPTURING
        syncForegroundType()

        if (mediaProjection != null) {
            takeScreenshot()
        } else {
            Log.i(OverlayService.TAG, "triggerVision: No MediaProjection session, launching permission app")
            pendingScreenshot = true
            openApp("vision")
        }
    }

    private fun openApp(action: String? = null) {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            if (action != null) {
                putExtra("action", action)
            }
        }
        if (intent != null) startActivity(intent)
    }

    private fun updateColor(colorStr: String?) {
        if (colorStr == null) return
        try {
            val color = Color.parseColor(colorStr)
            themeColor = color
            mainHandler.post {
                eyesView?.eyeColor = color
                waveformView?.color = color
                
                // Update all icons
                iconViews.forEach { view ->
                    if (view is FrameLayout && view.childCount > 0) {
                        view.getChildAt(0).invalidate()
                    }
                }

                // Update existing message bubbles
                for (i in 0 until (bubblesContainer?.childCount ?: 0)) {
                    val bubble = bubblesContainer?.getChildAt(i) as? TextView
                    if (bubble != null) {
                        // AI text/border color sync
                        bubble.setTextColor(themeColor)
                        (bubble.background as? GradientDrawable)?.apply {
                            setStroke((1 * resources.displayMetrics.density).toInt(), Color.argb(38, Color.red(themeColor), Color.green(themeColor), Color.blue(themeColor)))
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Invalid color string: $colorStr")
        }
    }

    fun addMessage(message: String?, sender: String?) {
        if (message == null) return
        mainHandler.post {
            val density = resources.displayMetrics.density
            val bubble = TextView(this).apply {
                text = message
                setTextColor(if (sender == "user") Color.parseColor("#eeeeee") else themeColor)
                setPadding((14*density).toInt(), (10*density).toInt(), (14*density).toInt(), (10*density).toInt())
                background = GradientDrawable().apply {
                    val bgColor = if (sender == "user") Color.argb(64, 0, 122, 255) else Color.argb(102, 40, 40, 40)
                    val brdColor = if (sender == "user") Color.argb(102, 0, 122, 255) else Color.argb(38, Color.red(themeColor), Color.green(themeColor), Color.blue(themeColor))
                    setColor(bgColor)
                    setStroke((1 * density).toInt(), brdColor)
                    cornerRadius = 18 * density
                }
                layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                    topMargin = (8 * density).toInt()
                    gravity = if (sender == "user") Gravity.END else Gravity.START
                }
            }
            bubblesContainer?.addView(bubble)
            (bubblesContainer?.parent as? ScrollView)?.post { (bubblesContainer?.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN) }
        }
    }

    private fun toggleExpansion() {
        if (currentSize == SoraSize.COMPACT) {
            animateToSize(SoraSize.MINI)
        } else {
            animateToSize(SoraSize.COMPACT)
        }
    }

    private fun toggleMaximize() {
        if (currentSize == SoraSize.HALF) {
            animateToSize(SoraSize.MINI)
        } else {
            animateToSize(SoraSize.HALF)
        }
    }

    private fun animateToSize(targetSize: SoraSize) {
        val density = resources.displayMetrics.density
        val oldSize = currentSize
        currentSize = targetSize
        
        val targetWidth = when(targetSize) {
            SoraSize.COMPACT -> (100 * density).toInt()
            else -> (340 * density).toInt()
        }
        val targetHeight = when(targetSize) {
            SoraSize.COMPACT -> (40 * density).toInt()
            SoraSize.MINI -> (200 * density).toInt()
            SoraSize.HALF -> (resources.displayMetrics.heightPixels * 0.45).toInt()
        }

        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 350
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { anim ->
                val p = anim.animatedValue as Float
                layoutParams?.width = (layoutParams!!.width + (targetWidth - layoutParams!!.width) * p).toInt()
                layoutParams?.height = (layoutParams!!.height + (targetHeight - layoutParams!!.height) * p).toInt()
                windowManager?.updateViewLayout(container, layoutParams)
                
                maximizeIcon?.invalidate()
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationStart(a: android.animation.Animator) {
                    if (targetSize != SoraSize.COMPACT) {
                        mainContent?.visibility = View.VISIBLE
                        // Adjust eyes pos for expanded mode
                        leftPanel?.apply {
                            (layoutParams as? LinearLayout.LayoutParams)?.apply {
                                leftMargin = (10 * density).toInt()
                                topMargin = (20 * density).toInt()
                            }
                        }
                    } else {
                        // Reset eyes for compact mode to ensure visibility
                        leftPanel?.apply {
                            (layoutParams as? LinearLayout.LayoutParams)?.apply {
                                leftMargin = 0
                                topMargin = 0
                            }
                        }
                    }
                }
                override fun onAnimationEnd(a: android.animation.Animator) {
                    if (targetSize == SoraSize.COMPACT) mainContent?.visibility = View.GONE
                    maximizeIcon?.invalidate()
                }
            })
            start()
        }
    }

    // --- Screen Capture ---
    fun startScreenCapture(resultCode: Int, data: Intent) {
        try {
            Log.i(OverlayService.TAG, "startScreenCapture: Synchronous FGS upgrade starting...")
            OverlayService.lastResultCode = resultCode
            OverlayService.lastResultData = data
            saveProjectionToken(resultCode, data)
            
            // CRITICAL: Set state BEFORE acquiring projection
            isProcessingCapture = true
            applyState(OverlayState.CAPTURING)
            
            // Small delay to ensure OS processes the FGS upgrade
            mainHandler.postDelayed({
                try {
                    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                    mediaProjection = manager.getMediaProjection(resultCode, data)
                    
                    if (mediaProjection == null) throw Exception("Manager returned null token")
                    Log.i(OverlayService.TAG, "MediaProjection token acquired: $mediaProjection")
                    
                    if (pendingScreenshot) {
                        pendingScreenshot = false
                        performNativeCapture()
                    } else {
                        applyState(OverlayState.IDLE)
                        isProcessingCapture = false
                    }
                } catch (e: Exception) {
                    Log.e(OverlayService.TAG, "Delayed acquisition failed", e)
                    handleCaptureError("ACQUISITION_FAILED")
                }
            }, 300)
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "startScreenCapture failed", e)
            handleCaptureError("INIT_FAILED")
        }
    }

    fun takeScreenshot() {
        if (isProcessingCapture) {
            Log.w(OverlayService.TAG, "takeScreenshot: Busy")
            return
        }
        
        Log.i(OverlayService.TAG, "Nuclear Vision R4: Initiate Capture")
        isProcessingCapture = true
        applyState(OverlayState.CAPTURING)
        
        // Hide overlay so it's not in the shot
        container?.alpha = 0f

        // 1. Path A: Accessibility Service (Zero-latency, no UI)
        val acc = SoraAccessibilityService.instance
        if (acc != null) {
            Log.i(OverlayService.TAG, "Path A: Accessibility")
            startCaptureWatchdog(4000) 
            acc.takeScreenshotQuick()
            return
        }

        // 2. Path B: MediaProjection (Last fallback)
        if (mediaProjection != null) {
            Log.i(OverlayService.TAG, "Path B: Projection")
            performNativeCapture()
            return
        }

        // 3. Path C: Atomic Recovery
        if (OverlayService.lastResultCode != 0 && OverlayService.lastResultData != null) {
            Log.i(OverlayService.TAG, "Path C: Token Recovery")
            pendingScreenshot = true
            startScreenCapture(OverlayService.lastResultCode, OverlayService.lastResultData!!)
            return
        }

        // 4. Path D: Permission Fallback
        Log.i(OverlayService.TAG, "Path D: Relaunch Needed")
        pendingScreenshot = true
        container?.alpha = 1f
        isProcessingCapture = false
        applyState(OverlayState.IDLE)
        OverlayModule.instance?.requestScreenCapturePermission()
    }

    private fun performNativeCapture() {
        if (mediaProjection == null) {
            Log.e(OverlayService.TAG, "performNativeCapture: Null projection")
            handleCaptureError("NULL_PROJECTION")
            return
        }
        
        isProcessingCapture = true
        container?.alpha = 0f
        applyState(OverlayState.CAPTURING)
        startCaptureWatchdog(8000)

        try {
            val metrics = resources.displayMetrics
            // Always create a fresh ImageReader to avoid stale buffers
            imageReader = ImageReader.newInstance(metrics.widthPixels, metrics.heightPixels, PixelFormat.RGBA_8888, 2)
            
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "SoraCapture", metrics.widthPixels, metrics.heightPixels, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader?.surface, null, captureHandler
            )

            if (virtualDisplay == null) throw Exception("VirtualDisplay creation failed")

            imageReader?.setOnImageAvailableListener({ reader ->
                val img = try { reader.acquireLatestImage() } catch (e: Exception) { null }
                if (img == null) return@setOnImageAvailableListener
                
                // Nuclear choice: Single shot.
                reader.setOnImageAvailableListener(null, null)
                captureHandler?.post {
                    try {
                        val bitmap = processImage(img)
                        val base64 = encodeBitmap(bitmap)
                        OverlayModule.sendEventToJS("SCREENSHOT_CAPTURED", Arguments.createMap().apply { putString("base64", base64) })
                    } catch (e: Exception) {
                        Log.e(OverlayService.TAG, "Capture encoding failed", e)
                        handleCaptureError("ENCODING_FAILED")
                    } finally {
                        img.close()
                        mainHandler.post { cleanupCapture() }
                    }
                }
            }, captureHandler)
            
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Native capture setup failed", e)
            handleCaptureError("SETUP_FAILED")
        }
    }

    private fun handleCaptureError(error: String) {
        mainHandler.post {
            isProcessingCapture = false
            pendingScreenshot = false
            container?.alpha = 1f
            applyState(OverlayState.IDLE)
            cleanupCapture()
            OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply { putString("error", error) })
        }
    }

    private fun startCaptureWatchdog(timeoutMs: Long) {
        captureWatchdog?.let { mainHandler.removeCallbacks(it) }
        captureWatchdog = Runnable {
            if (isProcessingCapture || container?.alpha == 0f) {
                Log.w(OverlayService.TAG, "WATCHDOG: Capture timed out. Resetting overlay visibility.")
                container?.alpha = 1f
                isProcessingCapture = false
                applyState(OverlayState.IDLE)
                cleanupCapture()
                OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply { putString("error", "WATCHDOG_TIMEOUT") })
            }
        }
        mainHandler.postDelayed(captureWatchdog!!, timeoutMs)
    }

    private fun stopCaptureWatchdog() {
        captureWatchdog?.let { mainHandler.removeCallbacks(it) }
        captureWatchdog = null
    }

    private fun processImage(img: android.media.Image): Bitmap {
        val plane = img.planes[0]
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * img.width
        val bitmap = Bitmap.createBitmap(img.width + rowPadding / pixelStride, img.height, Bitmap.Config.ARGB_8888)
        bitmap.copyPixelsFromBuffer(buffer)
        return Bitmap.createBitmap(bitmap, 0, 0, img.width, img.height)
    }

    private fun encodeBitmap(bm: Bitmap): String {
        val out = ByteArrayOutputStream()
        bm.compress(Bitmap.CompressFormat.JPEG, 70, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    fun cleanupCapture() {
        stopCaptureWatchdog()
        try {
            virtualDisplay?.release()
            virtualDisplay = null
            imageReader?.close()
            imageReader = null
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Cleanup failed", e)
        }
        
        mainHandler.post { 
            container?.alpha = 1f 
            isProcessingCapture = false
            if (currentState == OverlayState.CAPTURING) {
                applyState(OverlayState.IDLE)
            }
        }
    }

    private fun saveProjectionToken(resultCode: Int, data: Intent) {
        try {
            val prefs = getSharedPreferences("sora_vision_prefs", Context.MODE_PRIVATE)
            prefs.edit().apply {
                putInt("last_result_code", resultCode)
                putString("last_result_data", data.toUri(Intent.URI_INTENT_SCHEME))
                apply()
            }
            Log.i(OverlayService.TAG, "Nuclear Token saved to SharedPreferences")
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Failed to save token", e)
        }
    }

    private fun loadProjectionToken() {
        try {
            val prefs = getSharedPreferences("sora_vision_prefs", Context.MODE_PRIVATE)
            val resultCode = prefs.getInt("last_result_code", 0)
            val dataUri = prefs.getString("last_result_data", null)
            
            if (resultCode != 0 && dataUri != null) {
                OverlayService.lastResultCode = resultCode
                OverlayService.lastResultData = Intent.parseUri(dataUri, Intent.URI_INTENT_SCHEME)
                Log.i(OverlayService.TAG, "Nuclear Token recovered from SharedPreferences")
            }
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Failed to recover token", e)
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        try {
            val enabledServices = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            return enabledServices?.contains(packageName + "/.SoraAccessibilityService") == true
        } catch (e: Exception) {
            return false
        }
    }

    override fun onDestroy() {
        Log.i(OverlayService.TAG, "Service being destroyed")
        shutdown()
        super.onDestroy()
    }

    private fun shutdown() {
        instance = null
        removeOverlay()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
    }

    private fun removeOverlay() {
        try { 
            if (container?.parent != null) {
                windowManager?.removeView(container) 
            }
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Error removing view", e)
        }
        // Cleanup capture resources but keep persistence if active
        cleanupCapture()
    }

    private fun buildNotification(text: String): Notification {
        val intent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, OverlayService.CHANNEL_ID)
            .setContentTitle("Sora Assistant")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(OverlayService.CHANNEL_ID, "Sora Background Service", NotificationManager.IMPORTANCE_LOW)
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createTouchListener() = object : View.OnTouchListener {
        private var initialX = 0; private var initialY = 0
        private var initialTouchX = 0f; private var initialTouchY = 0f
        private var isDragging = false
        override fun onTouch(v: View, e: MotionEvent): Boolean {
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = layoutParams!!.x; initialY = layoutParams!!.y
                    initialTouchX = e.rawX; initialTouchY = e.rawY
                    isDragging = false
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - initialTouchX; val dy = e.rawY - initialTouchY
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) isDragging = true
                    if (isDragging) {
                        layoutParams!!.x = initialX + dx.toInt()
                        layoutParams!!.y = initialY + dy.toInt()
                        windowManager?.updateViewLayout(container, layoutParams)
                    }
                    return true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) toggleExpansion()
                    return true
                }
            }
            return false
        }
    }

    private val MATCH_PARENT = LinearLayout.LayoutParams.MATCH_PARENT
    private val WRAP_CONTENT = LinearLayout.LayoutParams.WRAP_CONTENT
}
