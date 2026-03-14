import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface VoiceGlobeProps {
    amplitude: number;
    isListening: boolean;
    isSpeaking: boolean;
    isThinking: boolean;
}

// The Canvas animation as an HTML string — shared between web and mobile WebView
const generateGlobeHTML = () => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin: 0; padding: 0; }
  body { background: transparent; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="globe"></canvas>
<script>
  const canvas = document.getElementById('globe');
  const ctx = canvas.getContext('2d');
  
  // State managed via postMessage
  let state = { amplitude: 0, isListening: false, isSpeaking: false, isThinking: false };
  
  // Listen for state updates from React Native / parent
  window.addEventListener('message', (e) => {
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (data.type === 'STATE_UPDATE') {
        state = { ...state, ...data.state };
      }
    } catch(err) {}
  });
  // Also handle RN WebView messages
  document.addEventListener('message', (e) => {
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (data.type === 'STATE_UPDATE') {
        state = { ...state, ...data.state };
      }
    } catch(err) {}
  });

  function resize() {
    const s = Math.min(window.innerWidth, window.innerHeight, 400);
    canvas.width = s;
    canvas.height = s;
  }
  resize();
  window.addEventListener('resize', resize);

  const numParticles = 600;
  const particles = [];
  for (let i = 0; i < numParticles; i++) {
    particles.push({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
    });
  }

  const numRing = 120;
  const ringAngles = [];
  for (let i = 0; i < numRing; i++) {
    ringAngles.push((i / numRing) * Math.PI * 2);
  }

  let time = 0;

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const baseRadius = W * 0.3;

    time += 0.016;
    ctx.clearRect(0, 0, W, H);

    const { amplitude: amp, isListening, isSpeaking, isThinking } = state;

    // Glow
    const gc = isListening ? [255,74,106] : isSpeaking ? [0,255,136] : isThinking ? [255,215,0] : [74,158,255];
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 2);
    grad.addColorStop(0, 'rgba('+gc.join(',')+',0.15)');
    grad.addColorStop(0.5, 'rgba('+gc.join(',')+',0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const reactivity = isListening ? amp * 0.4 : isSpeaking ? 0.15 : isThinking ? 0.08 : 0.03;
    const rotY = time * 0.3;
    const rotX = Math.sin(time * 0.2) * 0.3;
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    const pColor = isListening ? '#ff4a6a' : isSpeaking ? '#00ff88' : isThinking ? '#ffd700' : '#4a9eff';

    const projected = [];
    for (const p of particles) {
      const r = baseRadius * (1 + Math.sin(p.theta * 3 + time * 2) * Math.cos(p.phi * 2 + time) * reactivity);
      const x0 = r * Math.sin(p.phi) * Math.cos(p.theta);
      const y0 = r * Math.sin(p.phi) * Math.sin(p.theta);
      const z0 = r * Math.cos(p.phi);
      const x1 = x0 * cosY - z0 * sinY;
      const z1 = x0 * sinY + z0 * cosY;
      const y1 = y0 * cosX - z1 * sinX;
      const z2 = y0 * sinX + z1 * cosX;
      projected.push({ x: cx + x1, y: cy + y1, z: z2, size: 1.2 + ((z2 + baseRadius) / (2 * baseRadius)) * 1.8 });
    }

    projected.sort((a, b) => a.z - b.z);

    for (const pt of projected) {
      const alpha = 0.15 + ((pt.z + baseRadius) / (2 * baseRadius)) * 0.7;
      ctx.fillStyle = pColor;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ring
    const ringR = baseRadius * 1.3;
    const ringTilt = Math.PI / 2 + Math.sin(time * 0.5) * 0.1;
    for (const angle of ringAngles) {
      const rx = ringR * Math.cos(angle + time * 0.5);
      const rz = ringR * Math.sin(angle + time * 0.5);
      const ry2 = -rz * Math.sin(ringTilt);
      const rz2 = rz * Math.cos(ringTilt);
      const rx3 = rx * cosY - rz2 * sinY;
      const rz3 = rx * sinY + rz2 * cosY;
      const alpha = 0.1 + ((rz3 + ringR) / (2 * ringR)) * 0.3;
      ctx.fillStyle = pColor;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(cx + rx3, cy + ry2, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Center glow
    const pulseSize = 8 + Math.sin(time * 3) * 3 + (isListening ? amp * 10 : isSpeaking ? 5 : 0);
    const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseSize);
    cGrad.addColorStop(0, pColor);
    cGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, pulseSize, 0, Math.PI * 2);
    ctx.fill();

    requestAnimationFrame(draw);
  }
  draw();
</script>
</body>
</html>
`;

// ─── Web: direct Canvas ────────────────────────────────────────
function WebGlobe({ amplitude, isListening, isSpeaking, isThinking }: VoiceGlobeProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animRef = useRef<number>(0);
    const stateRef = useRef({ amplitude, isListening, isSpeaking, isThinking });

    useEffect(() => {
        stateRef.current = { amplitude, isListening, isSpeaking, isThinking };
    }, [amplitude, isListening, isSpeaking, isThinking]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const W = 400, H = 400;
        canvas.width = W; canvas.height = H;
        const cx = W / 2, cy = H / 2, baseRadius = 120;

        const particles: { theta: number; phi: number }[] = [];
        for (let i = 0; i < 600; i++) {
            particles.push({ theta: Math.random() * Math.PI * 2, phi: Math.acos(2 * Math.random() - 1) });
        }
        const ringAngles: number[] = [];
        for (let i = 0; i < 120; i++) ringAngles.push((i / 120) * Math.PI * 2);

        let time = 0;
        const draw = () => {
            const s = stateRef.current;
            time += 0.016;
            ctx.clearRect(0, 0, W, H);

            const gc = s.isListening ? [255, 74, 106] : s.isSpeaking ? [0, 255, 136] : s.isThinking ? [255, 215, 0] : [74, 158, 255];
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 2);
            grad.addColorStop(0, `rgba(${gc},0.15)`);
            grad.addColorStop(0.5, `rgba(${gc},0.05)`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            const reactivity = s.isListening ? s.amplitude * 0.4 : s.isSpeaking ? 0.15 : s.isThinking ? 0.08 : 0.03;
            const rotY = time * 0.3, rotX = Math.sin(time * 0.2) * 0.3;
            const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
            const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
            const pColor = s.isListening ? '#ff4a6a' : s.isSpeaking ? '#00ff88' : s.isThinking ? '#ffd700' : '#4a9eff';

            const proj: { x: number; y: number; z: number; size: number }[] = [];
            for (const p of particles) {
                const r = baseRadius * (1 + Math.sin(p.theta * 3 + time * 2) * Math.cos(p.phi * 2 + time) * reactivity);
                const x0 = r * Math.sin(p.phi) * Math.cos(p.theta);
                const y0 = r * Math.sin(p.phi) * Math.sin(p.theta);
                const z0 = r * Math.cos(p.phi);
                const x1 = x0 * cosY - z0 * sinY, z1 = x0 * sinY + z0 * cosY;
                const y1 = y0 * cosX - z1 * sinX, z2 = y0 * sinX + z1 * cosX;
                proj.push({ x: cx + x1, y: cy + y1, z: z2, size: 1.2 + ((z2 + baseRadius) / (2 * baseRadius)) * 1.8 });
            }
            proj.sort((a, b) => a.z - b.z);
            for (const pt of proj) {
                ctx.fillStyle = pColor;
                ctx.globalAlpha = 0.15 + ((pt.z + baseRadius) / (2 * baseRadius)) * 0.7;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            const ringR = baseRadius * 1.3, ringTilt = Math.PI / 2 + Math.sin(time * 0.5) * 0.1;
            for (const angle of ringAngles) {
                const rx = ringR * Math.cos(angle + time * 0.5), rz = ringR * Math.sin(angle + time * 0.5);
                const ry2 = -rz * Math.sin(ringTilt), rz2 = rz * Math.cos(ringTilt);
                const rx3 = rx * cosY - rz2 * sinY, rz3 = rx * sinY + rz2 * cosY;
                ctx.fillStyle = pColor;
                ctx.globalAlpha = 0.1 + ((rz3 + ringR) / (2 * ringR)) * 0.3;
                ctx.beginPath(); ctx.arc(cx + rx3, cy + ry2, 1, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;

            const pulseSize = 8 + Math.sin(time * 3) * 3 + (s.isListening ? s.amplitude * 10 : s.isSpeaking ? 5 : 0);
            const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseSize);
            cGrad.addColorStop(0, pColor); cGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cGrad;
            ctx.beginPath(); ctx.arc(cx, cy, pulseSize, 0, Math.PI * 2); ctx.fill();

            animRef.current = requestAnimationFrame(draw);
        };
        draw();
        return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
    }, []);

    return (
        <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <canvas ref={canvasRef as any} style={{ width: 400, height: 400, maxWidth: '100%' }} />
        </View>
    );
}

// ─── Mobile: WebView with the same Canvas animation ────────────
function MobileGlobe({ amplitude, isListening, isSpeaking, isThinking }: VoiceGlobeProps) {
    const webViewRef = useRef<any>(null);
    const WebView = require('react-native-webview').default;

    // Send state updates to the WebView
    useEffect(() => {
        const msg = JSON.stringify({
            type: 'STATE_UPDATE',
            state: { amplitude, isListening, isSpeaking, isThinking }
        });
        webViewRef.current?.postMessage(msg);
    }, [amplitude, isListening, isSpeaking, isThinking]);

    return (
        <View style={mobileStyles.container}>
            <WebView
                ref={webViewRef}
                source={{ html: generateGlobeHTML() }}
                style={mobileStyles.webview}
                scrollEnabled={false}
                overScrollMode="never"
                bounces={false}
                javaScriptEnabled={true}
                originWhitelist={['*']}
                backgroundColor="transparent"
                androidLayerType="hardware"
            />
        </View>
    );
}

const mobileStyles = StyleSheet.create({
    container: {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});

export default function VoiceGlobe(props: VoiceGlobeProps) {
    if (Platform.OS === 'web') {
        return <WebGlobe {...props} />;
    }
    return <MobileGlobe {...props} />;
}
