import React from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Platform, StatusBar, ActivityIndicator,
    Linking, Alert, TextInput
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Moon, Sparkles, User, MessageSquare, Mic, Globe } from 'lucide-react-native';
import { useSoraSettings } from '../context/SoraSettingsContext';
import { useAuth } from '../context/AuthContext';
import { getDynamicApiUrl } from '../api/client';
import { getServerUrl, saveServerUrl } from '../utils/storage';
import { DEFAULT_BASE_URL } from '../constants/settings';

import { THEMES, PERSONAS, TONES, VOICES, STORAGE_KEYS } from '../constants/settings';
// ── Helper ────────────────────────────────────────────────────────────────────
function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <View style={styles.sectionRow}>
            {icon}
            <Text style={styles.sectionLabel}>{label}</Text>
        </View>
    );
}

// ── Option Pill ───────────────────────────────────────────────────────────────
function Pill({ label, desc, active, onPress, accent = '#6c63ff' }: {
    label: string; desc?: string; active: boolean; onPress: () => void; accent?: string;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[styles.pill, active && { borderColor: accent, backgroundColor: `${accent}22` }]}
            activeOpacity={0.75}
        >
            <View style={[styles.pillDot, { backgroundColor: active ? accent : '#334155' }]} />
            <View style={{ flex: 1 }}>
                <Text style={[styles.pillLabel, active && { color: '#f1f5f9' }]}>{label}</Text>
                {desc ? <Text style={styles.pillDesc}>{desc}</Text> : null}
            </View>
        </TouchableOpacity>
    );
}

// ── Theme Swatch ──────────────────────────────────────────────────────────────
function ThemeSwatch({ theme, active, onPress }: { theme: typeof THEMES[0]; active: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} style={styles.swatchWrap} activeOpacity={0.8}>
            <View style={[styles.swatch, { backgroundColor: theme.bg }, active && styles.swatchActive]}>
                {/* Simulated eye preview */}
                <View style={[styles.eyePreviewBg, { backgroundColor: theme.eyeBg }]}>
                    <View style={[styles.eyePreviewDot, { backgroundColor: theme.eyeColor }]} />
                </View>
            </View>
            <Text style={[styles.swatchLabel, active && { color: '#a78bfa' }]}>{theme.label}</Text>
        </TouchableOpacity>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
    const { settings, updateTheme, updatePersona, updateTone, updateVoice } = useSoraSettings();
    const { user } = useAuth();

    // Local state for buffering changes
    const [localTheme, setLocalTheme] = React.useState(settings.theme);
    const [localPersona, setLocalPersona] = React.useState(settings.persona);
    const [localTone, setLocalTone] = React.useState(settings.tone);
    const [localVoice, setLocalVoice] = React.useState(settings.voiceId);
    const [localUrl, setLocalUrl] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);

    React.useEffect(() => {
        const loadUrl = async () => {
            const url = await getServerUrl();
            setLocalUrl(url || DEFAULT_BASE_URL);
        };
        loadUrl();
    }, []);

    const hasChanges = localTheme !== settings.theme ||
        localPersona !== settings.persona ||
        localTone !== settings.tone ||
        localVoice !== settings.voiceId;

    const handleSave = async () => {
        setIsSaving(true);
        if (localTheme !== settings.theme) updateTheme(localTheme);
        if (localPersona !== settings.persona) updatePersona(localPersona);
        if (localTone !== settings.tone) updateTone(localTone);
        if (localVoice !== settings.voiceId) updateVoice(localVoice);
        
        await saveServerUrl(localUrl);

        // Small delay for UX feel
        setTimeout(() => {
            setIsSaving(false);
        }, 800);
    };
    
    const handleLinkGoogle = async () => {
        try {
            const baseUrl = await getDynamicApiUrl();
            // baseUrl is like "http://192.168.1.10:3000/api"
            // The endpoint is /auth/google
            const authUrl = `${baseUrl}/auth/google?userId=${user?.id}`;
            await Linking.openURL(authUrl);
        } catch (err) {
            console.error('Failed to open Google Auth URL:', err);
            Alert.alert('Error', 'Could not open browser for Google authentication.');
        }
    };

    return (
        <LinearGradient colors={['#080a14', '#020617']} style={styles.root}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Sora Settings</Text>
                    <Text style={styles.headerSub}>Personalise your AI companion</Text>
                </View>

                {/* ── Color Theme ── */}
                <View style={styles.card}>
                    <SectionTitle
                        icon={<Moon color="#a78bfa" size={16} strokeWidth={2} />}
                        label="Eye & Color Theme"
                    />
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.swatchRow}
                    >
                        {THEMES.map(t => (
                            <ThemeSwatch
                                key={t.id}
                                theme={t}
                                active={localTheme === t.id}
                                onPress={() => setLocalTheme(t.id)}
                            />
                        ))}
                    </ScrollView>
                </View>

                {/* ── Persona ── */}
                <View style={styles.card}>
                    <SectionTitle
                        icon={<User color="#34d399" size={16} strokeWidth={2} />}
                        label="Persona"
                    />
                    {PERSONAS.map(p => (
                        <Pill
                            key={p.id}
                            label={p.label}
                            desc={p.desc}
                            active={localPersona === p.id}
                            accent="#34d399"
                            onPress={() => setLocalPersona(p.id)}
                        />
                    ))}
                </View>

                {/* ── Response Tone ── */}
                <View style={styles.card}>
                    <SectionTitle
                        icon={<MessageSquare color="#60a5fa" size={16} strokeWidth={2} />}
                        label="Response Tone"
                    />
                    {TONES.map(t => (
                        <Pill
                            key={t.id}
                            label={t.label}
                            desc={t.desc}
                            active={localTone === t.id}
                            accent="#60a5fa"
                            onPress={() => setLocalTone(t.id)}
                        />
                    ))}
                </View>

                {/* ── Voice ── */}
                <View style={styles.card}>
                    <SectionTitle
                        icon={<Mic color="#f472b6" size={16} strokeWidth={2} />}
                        label="Voice"
                    />
                    {VOICES.map(v => (
                        <Pill
                            key={v.id}
                            label={`${v.gender === 'F' ? '♀' : '♂'}  ${v.label}`}
                            desc={v.desc}
                            active={localVoice === v.id}
                            accent="#f472b6"
                            onPress={() => setLocalVoice(v.id)}
                        />
                    ))}
                </View>

                {/* ── Integrations ── */}
                <View style={styles.card}>
                    <SectionTitle
                        icon={<Globe color="#fcd34d" size={16} strokeWidth={2} />}
                        label="Integrations"
                    />
                    <Text style={styles.cardDesc}>
                        Link your Google account to give Sora access to your Calendar and Gmail.
                    </Text>
                    <TouchableOpacity style={styles.googleButton} onPress={handleLinkGoogle}>
                        <Text style={styles.googleButtonText}>Link Google Account</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Server Configuration ── */}
                <View style={styles.card}>
                    <SectionTitle
                        icon={<Globe color="#ef4444" size={16} strokeWidth={2} />}
                        label="Backend Configuration"
                    />
                    <Text style={styles.cardDesc}>
                        Enter your production Render URL or local IP address.
                    </Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            value={localUrl}
                            onChangeText={setLocalUrl}
                            placeholder="https://your-app.onrender.com"
                            placeholderTextColor="#475569"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>
                    <Text style={styles.inputHint}>Changes will apply after saving and restarting the app.</Text>
                </View>

                {/* ── Save Button ── */}
                {hasChanges && (
                    <TouchableOpacity
                        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                        onPress={handleSave}
                        disabled={isSaving}
                    >
                        <LinearGradient
                            colors={['#7c3aed', '#6d28d9']}
                            style={StyleSheet.absoluteFillObject}
                        />
                        {isSaving ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.saveButtonText}>Save Changes</Text>
                        )}
                    </TouchableOpacity>
                )}

                {/* Footer note */}
                <View style={styles.footerNote}>
                    <Sparkles color="#475569" size={14} strokeWidth={2} />
                    <Text style={styles.footerText}>Tap Save to apply changes</Text>
                </View>

            </ScrollView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: Platform.OS === 'android' ? 20 : 8 },

    header: { paddingVertical: 24 },
    headerTitle: { fontSize: 28, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.8 },
    headerSub: { fontSize: 13, color: '#64748b', marginTop: 4 },

    card: {
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 20, borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
        padding: 18, marginBottom: 16,
    },

    sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginLeft: 8 },

    // Swatches
    swatchRow: { paddingBottom: 4, gap: 12 },
    swatchWrap: { alignItems: 'center', width: 80 },
    swatch: {
        width: 72, height: 52, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 6,
    },
    swatchActive: { borderColor: '#a78bfa', borderWidth: 2 },
    eyePreviewBg: {
        width: 40, height: 20, borderRadius: 10,
        justifyContent: 'center', alignItems: 'center',
    },
    eyePreviewDot: { width: 10, height: 10, borderRadius: 5 },
    swatchLabel: { fontSize: 10, color: '#64748b', fontWeight: '600', textAlign: 'center' },

    // Pills
    pill: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderRadius: 14, marginBottom: 8,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    pillDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, flexShrink: 0 },
    pillLabel: { fontSize: 14, fontWeight: '600', color: '#94a3b8', marginBottom: 2 },
    pillDesc: { fontSize: 11, color: '#475569' },

    footerNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
    footerText: { fontSize: 11, color: '#475569', marginLeft: 6 },
    saveButton: {
        height: 56,
        borderRadius: 28,
        marginVertical: 20,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    saveButtonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 1,
    },
    cardDesc: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 16,
        lineHeight: 18,
    },
    googleButton: {
        backgroundColor: '#fff',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    googleButtonText: {
        color: '#1e293b',
        fontWeight: '700',
        fontSize: 14,
    },
    inputContainer: {
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    input: {
        color: '#f1f5f9',
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 14,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    inputHint: {
        fontSize: 10,
        color: '#475569',
        marginTop: 8,
        fontStyle: 'italic',
    },
});
