package com.sora.ai

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.*
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator

class SoraWaveformView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val bars = 5
    private val barHeights = FloatArray(bars) { 0.2f }
    private var animator: ValueAnimator? = null
    
    var color: Int = Color.parseColor("#00ddff")
        set(value) {
            field = value
            paint.color = value
            invalidate()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = this@SoraWaveformView.color
        style = Paint.Style.FILL
    }

    var isAnimating: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            if (value) startAnimating() else stopAnimating()
        }

    private fun startAnimating() {
        if (visibility != VISIBLE) return
        stopAnimating()
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 600
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener {
                val progress = it.animatedValue as Float
                for (i in 0 until bars) {
                    // Create phase-shifted sine wave for each bar
                    val phase = i * (Math.PI / 2.0)
                    val value = Math.sin(progress * 2.0 * Math.PI + phase).absoluteValue
                    barHeights[i] = 0.2f + (value.toFloat() * 0.8f)
                }
                invalidate()
            }
            start()
        }
    }

    private fun stopAnimating() {
        animator?.cancel()
        animator = null
        for (i in 0 until bars) barHeights[i] = 0.2f
        invalidate()
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility == VISIBLE && isAnimating) {
            startAnimating()
        } else if (visibility != VISIBLE) {
            animator?.cancel()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        
        val barWidth = width / (bars * 2f - 1f)
        val maxBarHeight = height.toFloat()
        
        for (i in 0 until bars) {
            val left = i * (barWidth * 2f)
            val h = maxBarHeight * barHeights[i]
            val top = (maxBarHeight - h) / 2f
            val rect = RectF(left, top, left + barWidth, top + h)
            canvas.drawRoundRect(rect, barWidth / 2f, barWidth / 2f, paint)
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopAnimating()
    }
}

private val Double.absoluteValue: Float
    get() = Math.abs(this).toFloat()
