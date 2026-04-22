package com.sora.ai

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.graphics.Paint
import android.graphics.Canvas
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
import android.graphics.BitmapFactory
import android.widget.ImageView
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
import android.media.AudioRecord
import android.media.AudioFormat
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
        IDLE, LISTENING, THINKING, SPEAKING, CAPTURING, LIVE
    }

    enum class SoraSize {
        COMPACT, MINI, HALF
    }

    companion object {
        internal const val TAG = "SoraOverlay"
        internal const val CHANNEL_ID = "sora_overlay_channel"
        internal const val NOTIFICATION_ID = 2001
        var instance: OverlayService? = null
        var pendingImageBase64: String? = null
        
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
    

    
    // Live Overlay State
    private var liveOverlayContainer: FrameLayout? = null
    private var liveGlowAnimator: ValueAnimator? = null

    // PCM Streaming (Gemini Live)
    private var pcmRecord: AudioRecord? = null
    private var isStreamingPCM = false
    private var pcmThread: Thread? = null

    // Wake Word Streaming (moved here for Foreground Service rights)
    private var wakeWordRecord: AudioRecord? = null
    private var isStreamingWakeWord = false
    private var wakeWordThread: Thread? = null

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
            "addMessage" -> {
                val imgBase64 = pendingImageBase64
                pendingImageBase64 = null
                addMessage(intent.getStringExtra("message"), intent.getStringExtra("sender"), imgBase64)
            }
            "hide" -> removeOverlay()
            "stop" -> shutdown()
            "startPCM" -> startPCMStreaming()
            "stopPCM" -> stopPCMStreaming()
        }
    }

    // ─── Native PCM Streaming (Gemini Live) ─────────────────────────────
    private fun startPCMStreaming() {
        if (isStreamingPCM) return
        
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "RECORD_AUDIO permission not granted for PCM Streaming!")
            return
        }

        try {
            val sampleRate = 16000
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            val minBufSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
            val bufferSize = if (minBufSize > 2560) minBufSize else 2560

            pcmRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize * 2
            )

            if (pcmRecord?.state != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "PCM AudioRecord initialization failed")
                return
            }

            isStreamingPCM = true
            syncForegroundType() // Assert MICROPHONE permission immediately
            
            pcmRecord?.startRecording()

            pcmThread = Thread {
                val buffer = ByteArray(3200) // 100ms at 16kHz 16-bit mono
                while (isStreamingPCM) {
                    val read = pcmRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (read > 0) {
                        val base64Data = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP)
                        val map = Arguments.createMap()
                        map.putString("audio", base64Data)
                        OverlayModule.sendEventToJS("PCM_AUDIO_CHUNK", map)
                    }
                }
            }
            pcmThread?.start()
            Log.i(TAG, "Native PCM streaming for Gemini Live started")
        } catch (e: Exception) {
            Log.e(TAG, "PCM streaming error", e)
            isStreamingPCM = false
            syncForegroundType()
        }
    }

    private fun stopPCMStreaming() {
        if (!isStreamingPCM) return
        isStreamingPCM = false
        Log.i(TAG, "Native PCM streaming for Gemini Live stopping...")
        
        try {
            pcmThread?.join(1000)
        } catch (e: Exception) {
            Log.e(TAG, "Error joining PCM thread", e)
        }
        
        try {
            pcmRecord?.stop()
            pcmRecord?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping PCM AudioRecord", e)
        }
        
        pcmRecord = null
        pcmThread = null
        syncForegroundType() // Release MICROPHONE permission
        Log.i(TAG, "Native PCM streaming fully stopped")
    }



    private fun startSafeForeground() {
        val notification = buildNotification("Sora is active")
        try {
            // Android 14: Start with MEDIA_PLAYBACK and MEDIA_PROJECTION 
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
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        }
        mainContent = mc

        // 1. Header Array
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
                setPadding((12 * density).toInt(), (12 * density).toInt(), (12 * density).toInt(), (6 * density).toInt())
            }
            
            // Cyan Dot
            addView(View(this@OverlayService).apply {
                layoutParams = LinearLayout.LayoutParams((8 * density).toInt(), (8 * density).toInt()).apply { marginEnd = (6 * density).toInt() }
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#00ddff")) }
            })
            // Teal Dot
            addView(View(this@OverlayService).apply {
                layoutParams = LinearLayout.LayoutParams((8 * density).toInt(), (8 * density).toInt()).apply { marginEnd = (8 * density).toInt() }
                background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#00ffb3")) }
            })
            // Title
            addView(TextView(this@OverlayService).apply {
                text = "KAAYA AI"
                setTextColor(Color.WHITE)
                textSize = 14f
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
            })
            
            // Shrink to Capsule (Minus)
            addView(createHeaderIcon("SHRINK_CAPSULE") { toggleExpansion() })
            
            // Minimize (Chat expansion drop)
            maximizeBtn = createHeaderIcon("MINIMIZE") { toggleMaximize() }
            maximizeIcon = (maximizeBtn as? FrameLayout)?.getChildAt(0)
            addView(maximizeBtn)
            
            // Close (Cross)
            addView(createHeaderIcon("CLOSE") { removeOverlay() })
        }
        mc.addView(header)

        // 2. Chat Area
        bubblesContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
            setPadding((12 * density).toInt(), (4 * density).toInt(), (12 * density).toInt(), (10 * density).toInt())
        }
        val scroller = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f)
            isVerticalScrollBarEnabled = false
            isFillViewport = true
            addView(bubblesContainer)
        }
        mc.addView(scroller)

        // 3. Bottom Controls
        val controls = createControlPanel(density)
        mc.addView(controls)
        
        // --- Capturing Overlay Text ---
        val capText = TextView(this).apply {
            text = "Capturing..."
            setTextColor(Color.WHITE)
            textSize = 12f
            visibility = View.GONE
            layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                gravity = Gravity.CENTER
                topMargin = (5 * density).toInt()
            }
        }
        (mc.getChildAt(0) as? ScrollView)?.let { 
             // We can't easily add to ScrollView directly here as it has bubblesContainer
        }

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

    private fun createHeaderIcon(type: String, onClick: () -> Unit): View {
        val density = resources.displayMetrics.density
        val size = (28 * density).toInt()
        val frame = android.widget.FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(size, size).apply { marginStart = (4 * density).toInt() }
            setOnClickListener { onClick() }
        }
        val icon = object : View(this) {
            val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                strokeWidth = 1.5f * density
                strokeCap = android.graphics.Paint.Cap.ROUND
                color = Color.parseColor("#888888")
            }
            override fun onDraw(c: android.graphics.Canvas) {
                val cx = width / 2f; val cy = height / 2f
                val s = 4 * density
                if (type == "CLOSE") {
                    c.drawLine(cx - s, cy - s, cx + s, cy + s, paint)
                    c.drawLine(cx + s, cy - s, cx - s, cy + s, paint)
                } else if (type == "MINIMIZE") {
                    // Chevron down
                    paint.style = android.graphics.Paint.Style.STROKE
                    c.drawLine(cx - s, cy - s/2, cx, cy + s/2, paint)
                    c.drawLine(cx, cy + s/2, cx + s, cy - s/2, paint)
                } else if (type == "SHRINK_CAPSULE") {
                    // Minus sign
                    paint.style = android.graphics.Paint.Style.STROKE
                    c.drawLine(cx - s, cy, cx + s, cy, paint)
                }
            }
        }
        frame.addView(icon)
        return frame
    }

    private fun createControlPanel(density: Float): View {
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
            setPadding((12 * density).toInt(), (8 * density).toInt(), (12 * density).toInt(), (12 * density).toInt())

            val visionBtn = createBottomIcon("EYE", disabled = false) { triggerVision() }
            addView(visionBtn)
            
            // Fake Text Input Bubble
            val fakeInput = android.widget.EditText(this@OverlayService).apply {
                hint = "Type a command..."
                setHintTextColor(Color.parseColor("#555555"))
                setTextColor(Color.WHITE)
                textSize = 14f
                maxLines = 1
                inputType = android.text.InputType.TYPE_CLASS_TEXT
                imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEND
                gravity = Gravity.CENTER_VERTICAL
                setPadding((14 * density).toInt(), 0, (14 * density).toInt(), 0)
                layoutParams = LinearLayout.LayoutParams(0, (40 * density).toInt(), 1f).apply {
                    marginStart = (8 * density).toInt()
                    marginEnd = (8 * density).toInt()
                }
                background = GradientDrawable().apply {
                    setColor(Color.argb(25, 255, 255, 255))
                    cornerRadius = 20 * density
                }
                
                setOnEditorActionListener { _, actionId, _ ->
                    if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) {
                        val txt = text.toString()
                        if (txt.isNotBlank()) {
                            setText("")
                            val map = Arguments.createMap().apply {
                                putString("action", "sendText")
                                putString("text", txt)
                            }
                            OverlayModule.sendEventToJS("OVERLAY_ACTION", map)
                        }
                        clearFocus()
                        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                        imm.hideSoftInputFromWindow(windowToken, 0)
                        true
                    } else false
                }
                
                setOnFocusChangeListener { _, hasFocus ->
                    val overlayLp = this@OverlayService.layoutParams
                    if (overlayLp != null) {
                        if (hasFocus) {
                            overlayLp.flags = overlayLp.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
                        } else {
                            overlayLp.flags = overlayLp.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                            imm.hideSoftInputFromWindow(windowToken, 0)
                        }
                        windowManager?.updateViewLayout(container, overlayLp)
                    }
                }
                
                addTextChangedListener(object : android.text.TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: android.text.Editable?) {
                        val hasText = s?.isNotBlank() == true
                        val micSendContainer = this@apply.tag as? FrameLayout
                        if (micSendContainer != null && micSendContainer.childCount >= 2) {
                            micSendContainer.getChildAt(0).visibility = if (hasText) View.GONE else View.VISIBLE
                            micSendContainer.getChildAt(1).visibility = if (hasText) View.VISIBLE else View.GONE
                        }
                    }
                })
            }
            addView(fakeInput)
            
            val micSendContainer = FrameLayout(this@OverlayService).apply {
                layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT)
            }
            fakeInput.tag = micSendContainer
            
            micBtn = createBottomIcon("MIC", disabled = false) { triggerMic() }
            val sendBtn = createBottomIcon("SEND", disabled = false) { 
                fakeInput.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_SEND) 
            }.apply { visibility = View.GONE }
            
            micSendContainer.addView(micBtn)
            micSendContainer.addView(sendBtn)
            addView(micSendContainer)
        }
    }

    private fun createBottomIcon(type: String, disabled: Boolean, onClick: () -> Unit): View {
        val density = resources.displayMetrics.density
        val size = (40 * density).toInt()
        val frame = android.widget.FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(size, size)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(if (disabled) Color.argb(64, 40, 40, 40) else Color.argb(128, 40, 40, 40))
                setStroke((1 * density).toInt(), Color.argb(25, 255, 255, 255))
            }
            setOnClickListener { if (!disabled) onClick() }
            if (type == "MIC") {
                setOnLongClickListener {
                    if (!disabled) triggerLiveMode()
                    true
                }
            }
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
                    "SEND" -> {
                        paint.style = android.graphics.Paint.Style.FILL
                        paint.color = Color.parseColor("#ff4444") // Red
                        val s = 6 * d
                        val path = android.graphics.Path()
                        path.moveTo(cx - s, cy - s)
                        path.lineTo(cx + s, cy)
                        path.lineTo(cx - s, cy + s)
                        path.lineTo(cx - s/2, cy)
                        path.close()
                        c.drawPath(path, paint)
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
            "live" -> OverlayState.LIVE
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

        // 4. Toggle Live Mode overlay
        if (state == OverlayState.LIVE) {
            showLiveOverlay()
        } else {
            hideLiveOverlay()
        }

        // 5. Manage Foreground Service Types (Android 14)
        syncForegroundType()
    }

    private fun syncForegroundType() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        
        // Base types
        var type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                   
        if (currentState == OverlayState.LISTENING || currentState == OverlayState.LIVE || isStreamingPCM) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
        
        // DATA_SYNC is required for background networking on Android 14+ to avoid suspension
        if (currentState != OverlayState.IDLE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Also add SPECIAL_USE for assistant-like background tasks
                type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            }
        }

        // Nuclear R4: Media projection MUST be explicitly active for capture to work on A14
        if (currentState == OverlayState.CAPTURING || isProcessingCapture || pendingScreenshot) {
            type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        }

        Log.i(OverlayService.TAG, "Atomic FGS Sync: type=$type, state=$currentState (pending=$pendingScreenshot, proc=$isProcessingCapture)")
        try {
            // Android 14 requires a fresh startForeground call to update types
            startForeground(OverlayService.NOTIFICATION_ID, buildNotification("Sora: ${currentState.name}"), type)
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "FGS Sync Failed", e)
        }
    }


    // ─── Live Mode Overlay ─────────────────────────────────────────────────────
    private fun showLiveOverlay() {
        if (liveOverlayContainer != null) return // Already showing
        
        val density = resources.displayMetrics.density
        
        // Hide normal content 
        contentWrap?.visibility = View.GONE
        
        // Expand overlay to half-screen for live mode
        val displayMetrics = resources.displayMetrics
        val screenWidth = displayMetrics.widthPixels
        val screenHeight = displayMetrics.heightPixels
        
        layoutParams?.width = screenWidth - (20 * density).toInt()
        layoutParams?.height = (screenHeight * 0.55).toInt()
        layoutParams?.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        layoutParams?.gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        layoutParams?.y = (20 * density).toInt()
        try { windowManager?.updateViewLayout(container, layoutParams) } catch (e: Exception) {}
        
        // Update container background to deep dark
        container?.background = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(Color.parseColor("#060608"), Color.parseColor("#060608"))
        ).apply {
            cornerRadius = 24 * density
        }
        
        liveOverlayContainer = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
            // Add a slight gradient overlay to match native
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.argb(40, 0, 0, 0), Color.TRANSPARENT, Color.argb(60, 0, 0, 0))
            )
        }
        
        // Header: "✦ Live"
        val headerText = TextView(this).apply {
            text = "✦ Live"
            setTextColor(Color.parseColor("#e4e4e7"))
            textSize = 15f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            letterSpacing = 0.05f
            setPadding((16 * density).toInt(), (14 * density).toInt(), 0, 0)
            layoutParams = FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                gravity = Gravity.TOP or Gravity.START
            }
        }
        liveOverlayContainer?.addView(headerText)
        
        // Glow Blobs (drawn as overlapping colored ovals with alpha animation)
        val glowContainer = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, (180 * density).toInt()).apply {
                gravity = Gravity.BOTTOM
                bottomMargin = (60 * density).toInt()
            }
        }
        
        // Blue glow blob
        val blueBlob = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#00b4d8"))
            }
            alpha = 0.5f
            layoutParams = FrameLayout.LayoutParams((200 * density).toInt(), (80 * density).toInt()).apply {
                gravity = Gravity.BOTTOM or Gravity.START
                marginStart = (30 * density).toInt()
                bottomMargin = (10 * density).toInt()
            }
        }
        glowContainer.addView(blueBlob)
        
        // Purple glow blob
        val purpleBlob = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#7b2ff7"))
            }
            alpha = 0.5f
            layoutParams = FrameLayout.LayoutParams((180 * density).toInt(), (70 * density).toInt()).apply {
                gravity = Gravity.BOTTOM or Gravity.END
                marginEnd = (30 * density).toInt()
                bottomMargin = (20 * density).toInt()
            }
        }
        glowContainer.addView(purpleBlob)
        
        // Teal glow blob
        val tealBlob = View(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#00ddff"))
            }
            alpha = 0.3f
            layoutParams = FrameLayout.LayoutParams((120 * density).toInt(), (50 * density).toInt()).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            }
        }
        glowContainer.addView(tealBlob)
        
        liveOverlayContainer?.addView(glowContainer)
        
        // Animate the glow pulsing
        liveGlowAnimator = ValueAnimator.ofFloat(0.3f, 0.8f).apply {
            duration = 1800
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                val alpha = it.animatedValue as Float
                blueBlob.alpha = alpha
                purpleBlob.alpha = alpha
                tealBlob.alpha = alpha * 0.6f
                
                val scale = 0.95f + (alpha - 0.3f) * 0.4f
                blueBlob.scaleX = scale
                blueBlob.scaleY = scale
                purpleBlob.scaleX = scale
                purpleBlob.scaleY = scale
            }
            start()
        }
        
        // Bottom Controls: Hold + End
        val controlsBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply {
                gravity = Gravity.BOTTOM
                bottomMargin = (20 * density).toInt()
            }
        }
        
        // Hold Button
        val holdWrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                marginEnd = (25 * density).toInt()
            }
        }
        val holdBtn = FrameLayout(this).apply {
            val sz = (52 * density).toInt()
            layoutParams = LinearLayout.LayoutParams(sz, sz)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(30, 255, 255, 255))
            }
        }
        // Pause icon (two bars)
        val pauseContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        }
        for (i in 0..1) {
            pauseContainer.addView(View(this).apply {
                layoutParams = LinearLayout.LayoutParams((4 * density).toInt(), (16 * density).toInt()).apply {
                    if (i == 0) marginEnd = (5 * density).toInt()
                }
                background = GradientDrawable().apply {
                    shape = GradientDrawable.RECTANGLE
                    cornerRadius = 2 * density
                    setColor(Color.WHITE)
                }
            })
        }
        holdBtn.addView(pauseContainer)
        holdWrapper.addView(holdBtn)
        holdWrapper.addView(TextView(this).apply {
            text = "Hold"
            setTextColor(Color.parseColor("#a1a1aa"))
            textSize = 12f
            gravity = Gravity.CENTER
            setPadding(0, (10 * density).toInt(), 0, 0)
        })
        controlsBar.addView(holdWrapper)
        
        // End Button
        val endWrapper = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                marginStart = (25 * density).toInt()
            }
        }
        val endBtn = FrameLayout(this).apply {
            val sz = (56 * density).toInt()
            layoutParams = LinearLayout.LayoutParams(sz, sz)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#ea4335"))
            }
            setOnClickListener {
                // Trigger end of live mode — send event to JS
                val event = Arguments.createMap()
                event.putString("action", "END_LIVE")
                OverlayModule.sendEventToJS("LIVE_END_REQUESTED", event)
                applyState(OverlayState.IDLE)
            }
            
            // Add X icon
            addView(object : View(this@OverlayService) {
                val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.WHITE
                    strokeWidth = 2.5f * density
                    strokeCap = android.graphics.Paint.Cap.ROUND
                }
                override fun onDraw(c: android.graphics.Canvas) {
                    val cx = width / 2f; val cy = height / 2f
                    val s = 7 * density
                    c.drawLine(cx - s, cy - s, cx + s, cy + s, paint)
                    c.drawLine(cx + s, cy - s, cx - s, cy + s, paint)
                }
            })
        }
        // X icon
        val xIcon = object : View(this@OverlayService) {
            val xPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                strokeWidth = 2.5f * density
                strokeCap = Paint.Cap.ROUND
            }
            override fun onDraw(c: Canvas) {
                val cx = width / 2f; val cy = height / 2f
                val s = 8 * density
                c.drawLine(cx - s, cy - s, cx + s, cy + s, xPaint)
                c.drawLine(cx + s, cy - s, cx - s, cy + s, xPaint)
            }
        }
        xIcon.layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        endBtn.addView(xIcon)
        endWrapper.addView(endBtn)
        endWrapper.addView(TextView(this).apply {
            text = "End"
            setTextColor(Color.parseColor("#a1a1aa"))
            textSize = 12f
            gravity = Gravity.CENTER
            setPadding(0, (10 * density).toInt(), 0, 0)
        })
        controlsBar.addView(endWrapper)
        
        liveOverlayContainer?.addView(controlsBar)
        container?.addView(liveOverlayContainer)
    }
    
    private fun hideLiveOverlay() {
        if (liveOverlayContainer == null) return
        
        liveGlowAnimator?.cancel()
        liveGlowAnimator = null
        
        container?.removeView(liveOverlayContainer)
        liveOverlayContainer = null
        
        // Restore normal content
        contentWrap?.visibility = View.VISIBLE
        
        // Restore normal overlay size
        val density = resources.displayMetrics.density
        container?.background = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(Color.argb(230, 24, 24, 28), Color.argb(245, 12, 12, 14))
        ).apply {
            cornerRadius = 24 * density
            setStroke((1.2 * density).toInt(), Color.argb(45, 255, 255, 255))
        }
        
        // Reset to compact size
        layoutParams?.width = (100 * density).toInt()
        layoutParams?.height = (40 * density).toInt()
        layoutParams?.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        layoutParams?.y = (10 * density).toInt()
        try { windowManager?.updateViewLayout(container, layoutParams) } catch (e: Exception) {}
    }


    // ─── Native MediaRecorder for Overlay Mic ─────────────────────────────
    private var nativeRecorder: MediaRecorder? = null
    private var isNativeRecording = false
    private var nativeRecordingFile: File? = null
    private var nativeRecordingTimeout: Runnable? = null

    private fun triggerMic() {
        if (isNativeRecording) {
            // Second tap: stop recording
            stopNativeRecording()
            return
        }

        Log.i(TAG, "Mic button pressed: starting native recording")

        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "RECORD_AUDIO permission not granted!")
            OverlayModule.sendEventToJS("RECORDING_ERROR", Arguments.createMap().apply {
                putString("error", "RECORD_AUDIO permission not granted")
            })
            return
        }

        try {
            // 1. Visual feedback immediately
            applyState(OverlayState.LISTENING)

            // 2. Create temp file
            val cacheDir = File(cacheDir, "Audio")
            if (!cacheDir.exists()) cacheDir.mkdirs()
            nativeRecordingFile = File(cacheDir, "recording-${System.currentTimeMillis()}.m4a")

            // 3. Setup MediaRecorder
            nativeRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            nativeRecorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16000)
                setAudioChannels(1)
                setAudioEncodingBitRate(128000)
                setOutputFile(nativeRecordingFile!!.absolutePath)
                prepare()
                start()
            }

            isNativeRecording = true
            Log.i(TAG, "Native recording started: ${nativeRecordingFile!!.absolutePath}")

            // 4. Auto-stop after 10 seconds
            nativeRecordingTimeout = Runnable {
                if (isNativeRecording) {
                    Log.i(TAG, "Native recording auto-stop (10s timeout)")
                    stopNativeRecording()
                }
            }
            mainHandler.postDelayed(nativeRecordingTimeout!!, 10000)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start native recording", e)
            isNativeRecording = false
            applyState(OverlayState.IDLE)
            OverlayModule.sendEventToJS("RECORDING_ERROR", Arguments.createMap().apply {
                putString("error", e.message ?: "Unknown recording error")
            })
        }
    }

    private fun stopNativeRecording() {
        if (!isNativeRecording) return
        isNativeRecording = false

        // Cancel auto-stop timer
        nativeRecordingTimeout?.let { mainHandler.removeCallbacks(it) }
        nativeRecordingTimeout = null

        Log.i(TAG, "Stopping native recording...")
        applyState(OverlayState.THINKING)

        try {
            nativeRecorder?.stop()
            nativeRecorder?.release()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping MediaRecorder", e)
        }
        nativeRecorder = null

        val file = nativeRecordingFile
        nativeRecordingFile = null

        if (file != null && file.exists() && file.length() > 0) {
            val uri = "file://${file.absolutePath}"
            Log.i(TAG, "Native recording saved: $uri (${file.length()} bytes)")
            val map = Arguments.createMap()
            map.putString("uri", uri)
            OverlayModule.sendEventToJS("RECORDING_FINISHED", map)
        } else {
            Log.e(TAG, "Native recording file is missing or empty")
            applyState(OverlayState.IDLE)
            OverlayModule.sendEventToJS("RECORDING_ERROR", Arguments.createMap().apply {
                putString("error", "Recording file was empty")
            })
        }
    }

    private fun triggerVision() {
        Log.i(OverlayService.TAG, "triggerVision: UI Vision button pressed or requested")
        // Use the nuclear R1-R4 pipeline instead of just openApp
        performCaptureWithBestPath(pendingVisionTranscript ?: "")
    }

    private fun triggerLiveMode() {
        Log.i(OverlayService.TAG, "triggerLiveMode: Requested from native UI")
        val event = Arguments.createMap()
        event.putString("action", "START_LIVE")
        OverlayModule.sendEventToJS("LIVE_START_REQUESTED", event)
        // Transition UI to live state locally for instant feedback
        applyState(OverlayState.LIVE)
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

    fun addMessage(message: String?, sender: String?, imageBase64: String?) {
        if (message == null && imageBase64 == null) return
        mainHandler.post {
            val density = resources.displayMetrics.density
            val screenWidth = resources.displayMetrics.widthPixels
            val maxBubbleWidth = (screenWidth * 0.65).toInt()
            val bubbleLayout = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                    topMargin = (8 * density).toInt()
                    gravity = if (sender == "user") Gravity.END else Gravity.START
                }
                background = GradientDrawable().apply {
                    val bgColor = if (sender == "user") Color.argb(64, 0, 122, 255) else Color.argb(102, 40, 40, 40)
                    val brdColor = if (sender == "user") Color.argb(102, 0, 122, 255) else Color.argb(38, Color.red(themeColor), Color.green(themeColor), Color.blue(themeColor))
                    setColor(bgColor)
                    setStroke((1 * density).toInt(), brdColor)
                    cornerRadius = 18 * density
                }
                setPadding((6*density).toInt(), (6*density).toInt(), (6*density).toInt(), (6*density).toInt())
            }
            bubbleLayout.post { if (bubbleLayout.width > maxBubbleWidth) { bubbleLayout.layoutParams.width = maxBubbleWidth; bubbleLayout.requestLayout() } }

            if (imageBase64 != null) {
                try {
                    val cleanBase64 = if (imageBase64.contains(",")) imageBase64.substringAfter(",") else imageBase64
                    val decodedString = Base64.decode(cleanBase64, Base64.DEFAULT)
                    val decodedByte = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.size)
                    val imageView = ImageView(this).apply {
                        setImageBitmap(decodedByte)
                        scaleType = ImageView.ScaleType.FIT_CENTER
                        layoutParams = LinearLayout.LayoutParams((180 * density).toInt(), (180 * density).toInt()).apply {
                            setMargins((4*density).toInt(), (4*density).toInt(), (4*density).toInt(), (4*density).toInt())
                        }
                    }
                    bubbleLayout.addView(imageView)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to decode image in addMessage", e)
                }
            }

            if (!message.isNullOrEmpty()) {
                val textView = TextView(this).apply {
                    text = message
                    setTextColor(if (sender == "user") Color.parseColor("#eeeeee") else themeColor)
                    setPadding((8*density).toInt(), (4*density).toInt(), (8*density).toInt(), (4*density).toInt())
                }
                bubbleLayout.addView(textView)
            }

            var lastClickTime = 0L
            bubbleLayout.setOnClickListener {
                val now = System.currentTimeMillis()
                if (now - lastClickTime < 300) {
                    if (!message.isNullOrEmpty()) {
                        val clip = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                        clip.setPrimaryClip(android.content.ClipData.newPlainText("Kaaya Copied", message))
                        android.widget.Toast.makeText(this@OverlayService, "Text copied to clipboard", android.widget.Toast.LENGTH_SHORT).show()
                    } else if (imageBase64 != null) {
                        try {
                            val cleanBase64 = if (imageBase64.contains(",")) imageBase64.substringAfter(",") else imageBase64
                            val decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                            val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
                            
                            val contentValues = android.content.ContentValues().apply {
                                put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, "KaayaImage_${System.currentTimeMillis()}.jpg")
                                put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/Kaaya")
                                }
                            }
                            val uri = contentResolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                            if (uri != null) {
                                contentResolver.openOutputStream(uri)?.use { outputStream ->
                                    bitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream)
                                }
                                android.widget.Toast.makeText(this@OverlayService, "Image saved directly to Gallery!", android.widget.Toast.LENGTH_SHORT).show()
                            } else {
                                android.widget.Toast.makeText(this@OverlayService, "Failed to save image to Gallery.", android.widget.Toast.LENGTH_SHORT).show()
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error saving image to gallery", e)
                            android.widget.Toast.makeText(this@OverlayService, "Error saving image.", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }
                }
                lastClickTime = now
            }

            bubblesContainer?.addView(bubbleLayout)

            // If typing indicator is showing, move it to the end so it stays below the new message
            typingIndicatorView?.let { indicator ->
                bubblesContainer?.removeView(indicator)
                bubblesContainer?.addView(indicator)
            }

            (bubblesContainer?.parent as? ScrollView)?.post { (bubblesContainer?.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN) }
        }
    }

    // ─── Streaming Support for Background Overlay ────────────────────────────

    private var typingIndicatorView: LinearLayout? = null
    private var typingAnimators = mutableListOf<ValueAnimator>()

    /**
     * Update the text of the last AI message bubble in-place (for streaming tokens).
     */
    fun updateLastMessage(message: String?) {
        if (message == null) return
        mainHandler.post {
            // Find the last AI bubble (LinearLayout with a TextView child)
            val count = bubblesContainer?.childCount ?: 0
            for (i in count - 1 downTo 0) {
                val child = bubblesContainer?.getChildAt(i)
                if (child is LinearLayout) {
                    // Check if it's an AI bubble (left-aligned = ai)
                    val lp = child.layoutParams as? LinearLayout.LayoutParams
                    if (lp?.gravity == Gravity.START) {
                        // Find the TextView inside
                        for (j in 0 until child.childCount) {
                            val tv = child.getChildAt(j)
                            if (tv is TextView) {
                                tv.text = message
                                (bubblesContainer?.parent as? ScrollView)?.post {
                                    (bubblesContainer?.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN)
                                }
                                return@post
                            }
                        }
                        // If no TextView found (e.g. typing indicator dots), continue to previous sibling!
                    }
                }
            }
        }
    }

    /**
     * Show animated typing indicator dots in the chat area.
     */
    fun showTypingIndicator() {
        mainHandler.post {
            if (typingIndicatorView != null) return@post // Already showing
            val density = resources.displayMetrics.density

            typingIndicatorView = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                layoutParams = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply {
                    topMargin = (8 * density).toInt()
                    gravity = Gravity.START
                }
                background = GradientDrawable().apply {
                    setColor(Color.argb(102, 40, 40, 40))
                    setStroke((1 * density).toInt(), Color.argb(38, 0, 221, 255))
                    cornerRadius = 18 * density
                }
                setPadding((14 * density).toInt(), (10 * density).toInt(), (14 * density).toInt(), (10 * density).toInt())
            }

            // Create 3 animated dots
            for (i in 0..2) {
                val dot = View(this).apply {
                    layoutParams = LinearLayout.LayoutParams((7 * density).toInt(), (7 * density).toInt()).apply {
                        marginEnd = (4 * density).toInt()
                    }
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(Color.parseColor("#00ddff"))
                    }
                    alpha = 0.3f
                }
                typingIndicatorView?.addView(dot)

                // Animate each dot with staggered delay
                val animator = ValueAnimator.ofFloat(0.3f, 1f, 0.3f).apply {
                    duration = 800
                    startDelay = (i * 200).toLong()
                    repeatCount = ValueAnimator.INFINITE
                    interpolator = AccelerateDecelerateInterpolator()
                    addUpdateListener { dot.alpha = it.animatedValue as Float }
                }
                typingAnimators.add(animator)
                animator.start()
            }

            bubblesContainer?.addView(typingIndicatorView)
            (bubblesContainer?.parent as? ScrollView)?.post {
                (bubblesContainer?.parent as? ScrollView)?.fullScroll(View.FOCUS_DOWN)
            }
        }
    }

    /**
     * Remove the typing indicator dots from the chat area.
     */
    fun hideTypingIndicator() {
        mainHandler.post {
            typingAnimators.forEach { it.cancel() }
            typingAnimators.clear()
            typingIndicatorView?.let { bubblesContainer?.removeView(it) }
            typingIndicatorView = null
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
                        // Hide eyes completely to allow chat to span full width
                        leftPanel?.visibility = View.GONE
                    } else {
                        // Reset eyes for compact mode
                        leftPanel?.visibility = View.VISIBLE
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
            Log.w(OverlayService.TAG, "takeScreenshot: Busy, ignoring duplicate")
            return
        }
        
        Log.i(OverlayService.TAG, "Vision Capture: Initiate")
        isProcessingCapture = true
        
        // CRITICAL: Upgrade FGS type to MEDIA_PROJECTION BEFORE any capture attempt
        // Android 14 requires this to be active before the projection is used
        applyState(OverlayState.CAPTURING)
        
        // Hide overlay so it's not in the shot
        mainHandler.post { container?.alpha = 0f }

        // Delay to ensure FGS type upgrade is processed by the OS
        captureHandler?.postDelayed({
            performCaptureWithBestPath()
        }, 200)
    }

    private fun performCaptureWithBestPath(transcript: String = "") {
        if (transcript.isNotEmpty()) {
            pendingVisionTranscript = transcript
        }
        
        Log.i(OverlayService.TAG, "performCaptureWithBestPath: transcript='$transcript'")
        // 1. Path A: Accessibility Service (Best — zero-latency, no UI, no extra permission)
        val acc = SoraAccessibilityService.instance
        if (acc != null) {
            Log.i(OverlayService.TAG, "Capture Path A: Accessibility Service")
            startCaptureWatchdog(8000) 
            acc.takeScreenshotQuick()
            return
        }

        // 2. Path B: Existing MediaProjection session
        if (mediaProjection != null) {
            Log.i(OverlayService.TAG, "Capture Path B: Existing MediaProjection")
            performNativeCapture()
            return
        }

        // 3. Path C: Recover token from SharedPreferences and re-create projection
        if (OverlayService.lastResultCode != 0 && OverlayService.lastResultData != null) {
            Log.i(OverlayService.TAG, "Capture Path C: Token Recovery")
            try {
                val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
                mediaProjection = manager.getMediaProjection(OverlayService.lastResultCode, OverlayService.lastResultData!!)
                if (mediaProjection != null) {
                    Log.i(OverlayService.TAG, "Path C: Token recovered, performing capture")
                    performNativeCapture()
                    return
                }
            } catch (e: Exception) {
                Log.e(OverlayService.TAG, "Path C: Token recovery failed", e)
                OverlayService.lastResultCode = 0
                OverlayService.lastResultData = null
            }
        }

        // 4. Path D: Need fresh permission — launch transparent activity
        Log.i(OverlayService.TAG, "Capture Path D: Need permission via transparent Activity")
        pendingScreenshot = true
        mainHandler.post {
            container?.alpha = 1f
            isProcessingCapture = false
            applyState(OverlayState.IDLE)
        }
        
        try {
            val intent = Intent(this, ScreenCapturePermissionActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(OverlayService.TAG, "Failed to launch ScreenCapturePermissionActivity", e)
            handleCaptureError("PERMISSION_ACTIVITY_FAILED")
        }
    }

    fun handleCapturePermissionResult(resultCode: Int, data: Intent?) {
        if (resultCode == Activity.RESULT_OK && data != null) {
            Log.i(OverlayService.TAG, "Screen capture permission GRANTED from Background Activity")
            startScreenCapture(resultCode, data)
        } else {
            Log.e(OverlayService.TAG, "Screen capture permission DENIED (resultCode: $resultCode)")
            clearPendingScreenshot()
            OverlayModule.sendEventToJS("SCREENSHOT_ERROR", Arguments.createMap().apply { putString("error", "PERMISSION_DENIED_BY_USER") })
        }
    }

    private fun performNativeCapture() {
        if (mediaProjection == null) {
            Log.e(OverlayService.TAG, "performNativeCapture: Null projection")
            handleCaptureError("NULL_PROJECTION")
            return
        }
        
        isProcessingCapture = true
        mainHandler.post { container?.alpha = 0f }
        applyState(OverlayState.CAPTURING)
        startCaptureWatchdog(10000)

        try {
            val metrics = resources.displayMetrics
            
            // Clean up any previous readers to avoid stale buffers
            try { imageReader?.close() } catch (e: Exception) {}
            try { virtualDisplay?.release() } catch (e: Exception) {}
            
            imageReader = ImageReader.newInstance(metrics.widthPixels, metrics.heightPixels, PixelFormat.RGBA_8888, 3)
            
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "SoraCapture", metrics.widthPixels, metrics.heightPixels, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, imageReader?.surface, null, captureHandler
            )

            if (virtualDisplay == null) throw Exception("VirtualDisplay creation failed")

            // CRITICAL FIX: Wait for the virtual display to render at least one frame
            // Android needs time to mirror the display to our surface
            var frameCount = 0
            imageReader?.setOnImageAvailableListener({ reader ->
                frameCount++
                // Skip the first frame (may be black/stale), capture the second
                if (frameCount < 2) {
                    try { reader.acquireLatestImage()?.close() } catch (e: Exception) {}
                    return@setOnImageAvailableListener
                }
                
                val img = try { reader.acquireLatestImage() } catch (e: Exception) { null }
                if (img == null) return@setOnImageAvailableListener
                
                // Single shot: stop listening
                reader.setOnImageAvailableListener(null, null)
                captureHandler?.post {
                    try {
                        val bitmap = processImage(img)
                        val base64 = encodeBitmap(bitmap)
                        Log.i(OverlayService.TAG, "Screenshot captured, base64 length: ${base64.length}")
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
            // If projection is dead (SecurityException), clear the stale token
            if (e is SecurityException) {
                Log.w(OverlayService.TAG, "SecurityException — clearing stale projection")
                mediaProjection = null
                OverlayService.lastResultCode = 0
                OverlayService.lastResultData = null
            }
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

}
