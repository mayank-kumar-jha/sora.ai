package com.sora.ai

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator

class SoraEyesView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    // Configurable eye color
    var eyeColor: Int = Color.parseColor("#00ddff")
        set(value) {
            if (field == value) return
            field = value
            eyePaint.color = value
            glowPaint.color = value
            glowPaint.alpha = 0
            invalidate()
        }

    var eyeState: String = "Idle"
        set(value) {
            val lower = value.lowercase()
            if (field == lower) return
            field = lower
            post { onStateChanged() }
        }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        onStateChanged()
    }

    private val eyePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = eyeColor
        style = Paint.Style.FILL
    }
    
    // Efficient glow paint for hardware acceleration
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = eyeColor
        style = Paint.Style.FILL
        alpha = 80
    }

    init {
        // Removing explicit hardware layer as it can cause instability in some overlay contexts.
    }

    // Normalized dimensions (will be scaled by density)
    private var leftEyeWidth = 12f
    private var rightEyeWidth = 12f
    private var leftEyeHeight = 20f
    private var rightEyeHeight = 20f
    private var leftRotation = 0f
    private var rightRotation = 0f
    private var eyeYOffset = 0f
    private var eyeXOffset = 0f // New: horizontal movement
    private var glowScale = 1.1f
    private var glowOpacity = 0.3f

    private var currentAnimator: ValueAnimator? = null
    private val uiHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var blinkRunnable: Runnable? = null

    init {
        scheduleBlink()
        startBreathingEffect()
        startMicroJitter()
    }

    private fun scheduleBlink() {
        blinkRunnable?.let { uiHandler.removeCallbacks(it) }
        // Faster, more varied tempo
        val nextTrigger = (1500..6000).random().toLong()
        blinkRunnable = Runnable {
            if (eyeState == "idle") {
                val rand = Math.random()
                when {
                    rand < 0.25 -> triggerRandomBurst() // 25% expression
                    rand < 0.35 -> doubleBlink()        // 10% double blink
                    else -> blink()                     // 65% single blink
                }
            }
            scheduleBlink()
        }
        uiHandler.postDelayed(blinkRunnable!!, nextTrigger)
    }

    private fun triggerRandomBurst() {
        val burstType = (0..5).random()
        when (burstType) {
            0 -> { // Happy Squint
                animateEyes(targetH = 8f, targetRot = 40f, burstDuration = 1000)
            }
            1 -> { // Thinking Tilt
                animateEyes(targetY = -5f, targetRot = 15f, burstDuration = 1400)
            }
            2 -> { // Look Left
                animateEyes(targetX = -6f, targetW = 11f, burstDuration = 1200)
            }
            3 -> { // Look Right
                animateEyes(targetX = 6f, targetW = 11f, burstDuration = 1200)
            }
            4 -> { // Sharp squint (serious/focused)
                animateEyes(targetH = 4f, targetW = 14f, burstDuration = 800)
            }
            5 -> { // Suspicious/Narrow
                animateEyes(targetH = 12f, targetRot = -10f, burstDuration = 1600)
            }
        }
    }

    private fun animateEyes(
        targetW: Float = 12f,
        targetH: Float = 20f,
        targetY: Float = 0f,
        targetX: Float = 0f,
        targetRot: Float = 0f,
        burstDuration: Long = 1000
    ) {
        val startW = leftEyeWidth
        val startH = leftEyeHeight
        val startY = eyeYOffset
        val startX = eyeXOffset
        val startR = rightRotation

        ValueAnimator.ofFloat(0f, 1f, 0f).apply {
            duration = burstDuration
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                val p = it.animatedValue as Float
                leftEyeWidth = startW + (targetW - startW) * p
                rightEyeWidth = leftEyeWidth
                leftEyeHeight = startH + (targetH - startH) * p
                rightEyeHeight = leftEyeHeight
                eyeYOffset = startY + (targetY - startY) * p
                eyeXOffset = startX + (targetX - startX) * p
                rightRotation = startR + (targetRot - startR) * p
                leftRotation = -rightRotation
                invalidate()
            }
            start()
        }
    }
    
    private fun doubleBlink() {
        blink()
        uiHandler.postDelayed({ blink() }, 200)
    }

    private fun blink() {
        val originalHeight = leftEyeHeight
        ValueAnimator.ofFloat(originalHeight, 2f, originalHeight).apply {
            duration = 150
            addUpdateListener {
                val h = it.animatedValue as Float
                leftEyeHeight = h
                rightEyeHeight = h
                invalidate()
            }
            start()
        }
    }

    private fun onStateChanged() {
        currentAnimator?.cancel()
        
        var targetWidth = 12f
        var targetHeight = 20f
        var targetYOffset = 0f
        var targetRot = 0f
        var targetGlow = 1f

        when (eyeState) {
            "listening" -> {
                targetHeight = 24f
                targetGlow = 1.3f
            }
            "speaking" -> {
                targetHeight = 32f
                targetGlow = 1.2f
            }
            "thinking" -> {
                targetYOffset = -2f
                targetRot = 10f
                targetWidth = 13f
            }
            "happy" -> {
                targetHeight = 16f
                targetRot = -12f
                targetYOffset = -2f
            }
            "alert" -> {
                targetHeight = 30f
                targetWidth = 16f
                targetGlow = 1.6f
            }
            "question" -> {
                targetRot = -10f
                targetHeight = 24f
            }
        }

        val startLW = leftEyeWidth
        val startLH = leftEyeHeight
        val startRY = rightRotation
        val startY = eyeYOffset
        val startG = glowScale
        
        currentAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                val p = it.animatedValue as Float
                leftEyeWidth = startLW + (targetWidth - startLW) * p
                rightEyeWidth = leftEyeWidth
                leftEyeHeight = startLH + (targetHeight - startLH) * p
                rightEyeHeight = leftEyeHeight
                rightRotation = startRY + (targetRot - startRY) * p
                leftRotation = -rightRotation
                eyeYOffset = startY + (targetYOffset - startY) * p
                eyeXOffset = 0f // Reset X offset on state change
                glowScale = startG + (targetGlow - startG) * p
                invalidate()
            }
            start()
        }

        // Start Rhythmic Animation for active states
        if (eyeState == "listening" || eyeState == "speaking" || eyeState == "thinking") {
            startRhythmicAnimation()
        } else {
            rhythmicAnimator?.cancel()
        }
    }

    private var rhythmicAnimator: ValueAnimator? = null

    private fun startRhythmicAnimation() {
        rhythmicAnimator?.cancel()
        
        when (eyeState) {
            "listening" -> {
                rhythmicAnimator = ValueAnimator.ofFloat(22f, 26f, 22f).apply {
                    duration = 1000
                    repeatCount = ValueAnimator.INFINITE
                    interpolator = AccelerateDecelerateInterpolator()
                    addUpdateListener {
                        val h = it.animatedValue as Float
                        leftEyeHeight = h
                        rightEyeHeight = h
                        leftEyeWidth = 12f + (h - 22f) * 0.5f
                        rightEyeWidth = leftEyeWidth
                        invalidate()
                    }
                    start()
                }
            }
            "speaking" -> {
                rhythmicAnimator = ValueAnimator.ofFloat(18f, 26f, 18f).apply {
                    duration = 600
                    repeatCount = ValueAnimator.INFINITE
                    interpolator = AccelerateDecelerateInterpolator()
                    addUpdateListener {
                        val h = it.animatedValue as Float
                        leftEyeHeight = h
                        rightEyeHeight = h
                        invalidate()
                    }
                    start()
                }
            }
            "thinking" -> {
                rhythmicAnimator = ValueAnimator.ofFloat(0f, 1.5f, -1.5f, 0f).apply {
                    duration = 400
                    repeatCount = ValueAnimator.INFINITE
                    addUpdateListener {
                        val offset = it.animatedValue as Float
                        leftRotation = -10f + offset
                        rightRotation = 10f + offset
                        invalidate()
                    }
                    start()
                }
            }
        }
    }

    private var breathingAnimator: ValueAnimator? = null
    private fun startBreathingEffect() {
        breathingAnimator?.cancel()
        breathingAnimator = ValueAnimator.ofFloat(0.2f, 0.4f, 0.2f).apply {
            duration = 3000
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                glowOpacity = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private var jitterAnimator: ValueAnimator? = null
    private fun startMicroJitter() {
        jitterAnimator?.cancel()
        jitterAnimator = ValueAnimator.ofFloat(-0.5f, 0.5f).apply {
            duration = (500..1500).random().toLong()
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            addUpdateListener {
                if (eyeState == "idle") {
                    val j = it.animatedValue as Float
                    // Stable micro-movement around 0
                    eyeYOffset = j * 0.2f
                    invalidate()
                }
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val density = resources.displayMetrics.density
        val centerX = width / 2f
        val centerY = height / 2f
        
        val gap = (16f * density)
        val eyeW = leftEyeWidth * density
        val eyeH = leftEyeHeight * density
        val yOff = eyeYOffset * density
        val xOff = eyeXOffset * density
        
        // Dynamic Radial Glow
        glowPaint.shader = RadialGradient(
            centerX + xOff, centerY + yOff, gap * 2.5f * glowScale,
            intArrayOf(Color.argb((glowOpacity * 255).toInt(), Color.red(eyeColor), Color.green(eyeColor), Color.blue(eyeColor)), Color.TRANSPARENT),
            null, Shader.TileMode.CLAMP
        )
        canvas.drawCircle(centerX + xOff, centerY + yOff, gap * 2.5f * glowScale, glowPaint)

        // Draw Eye Shapes
        drawEye(canvas, centerX - gap/2 - eyeW/2 + xOff, centerY + yOff, eyeW, eyeH, leftRotation)
        drawEye(canvas, centerX + gap/2 + eyeW/2 + xOff, centerY + yOff, eyeW, eyeH, rightRotation)
    }

    private fun drawEye(canvas: Canvas, x: Float, y: Float, w: Float, h: Float, rot: Float) {
        canvas.save()
        canvas.rotate(rot, x, y)
        val rect = RectF(x - w/2, y - h/2, x + w/2, y + h/2)
        canvas.drawRoundRect(rect, w/2, w/2, eyePaint)
        canvas.restore()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        uiHandler.removeCallbacksAndMessages(null)
        currentAnimator?.cancel()
        rhythmicAnimator?.cancel()
    }
}
