import React, { useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    ScrollView,
    Dimensions,
    Animated,
    StatusBar,
    Platform,
} from 'react-native';
import { useTasks } from '../hooks/useTasks';
import {
    Trash2, Plus, Zap, CheckCircle2, Clock,
    Circle, Sparkles, BarChart3, ChevronRight,
} from 'lucide-react-native';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 52) / 2;

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, bgColor, glowColor }: {
    label: string; value: string | number; icon: React.ReactNode;
    bgColor: string; glowColor: string;
}) {
    return (
        <View style={[styles.statCard, { backgroundColor: bgColor, width: CARD_W }]}>
            <View style={[styles.statGlow, { backgroundColor: glowColor }]} />
            <View style={styles.statIconWrap}>{icon}</View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

// ── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
    const s = (status ?? '').toLowerCase();
    let color = '#64748b', bg = 'rgba(100,116,139,0.18)';
    let Icon: any = Circle;
    if (s === 'completed' || s === 'done') {
        color = '#34d399'; bg = 'rgba(52,211,153,0.15)'; Icon = CheckCircle2;
    } else if (s === 'pending' || s === 'in_progress') {
        color = '#818cf8'; bg = 'rgba(108,99,255,0.15)'; Icon = Clock;
    }
    return (
        <View style={[styles.badge, { backgroundColor: bg }]}>
            <Icon color={color} size={10} strokeWidth={2.5} />
            <Text style={[styles.badgeText, { color }]}>{status ?? ''}</Text>
        </View>
    );
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ item, onDelete }: { item: any; onDelete: () => void }) {
    const scale = useRef(new Animated.Value(1)).current;
    const onIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 24 }).start();
    const onOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24 }).start();
    const isDone = ['completed', 'done'].includes((item.status ?? '').toLowerCase());

    return (
        <Animated.View style={[styles.taskWrap, { transform: [{ scale }] }]}>
            <View style={styles.taskGlass}>
                {/* Accent bar — two overlapping views simulating gradient */}
                <View style={styles.taskAccent}>
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: isDone ? '#34d399' : '#6c63ff' }]} />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: isDone ? '#6ee7b7' : '#38bdf8', opacity: 0.5 }]} />
                </View>

                <TouchableOpacity
                    activeOpacity={1}
                    onPressIn={onIn}
                    onPressOut={onOut}
                    style={styles.taskInner}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle} numberOfLines={1}>{item.title ?? ''}</Text>
                        <View style={styles.taskMeta}>
                            <StatusBadge status={item.status ?? 'unknown'} />
                            {item.scheduledAt ? (
                                <Text style={styles.taskTime}>
                                    {new Date(item.scheduledAt).toLocaleDateString()}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={onDelete}
                        style={styles.deleteBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Trash2 color="#f87171" size={16} strokeWidth={2} />
                    </TouchableOpacity>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
    const { tasks, isLoading, cancelTask } = useTasks();
    const safeTasks = Array.isArray(tasks) ? tasks : [];

    const total = safeTasks.length;
    const completed = safeTasks.filter((t: any) => ['completed', 'done'].includes((t.status ?? '').toLowerCase())).length;
    const pending = safeTasks.filter((t: any) => ['pending', 'in_progress'].includes((t.status ?? '').toLowerCase())).length;

    return (
        <View style={styles.root}>
            <StatusBar barStyle="light-content" backgroundColor="#070b14" />

            {/* Background */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#070b14' }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0e1225', opacity: 0.65 }]} />

            {/* Decorative blobs */}
            <View style={[styles.blob, { top: -90, left: -70, backgroundColor: 'rgba(108,99,255,0.12)' }]} />
            <View style={[styles.blob, { top: 260, right: -110, width: 260, height: 260, backgroundColor: 'rgba(56,189,248,0.09)' }]} />

            {isLoading ? (
                <View style={styles.loadingWrap}>
                    <ActivityIndicator color="#6c63ff" size="large" />
                    <Text style={styles.loadingText}>Loading tasks…</Text>
                </View>
            ) : (
                <FlatList
                    data={safeTasks}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListHeaderComponent={
                        <View>
                            {/* Header */}
                            <View style={styles.header}>
                                <View>
                                    <Text style={styles.greeting}>Welcome back 👋</Text>
                                    <Text style={styles.pageTitle}>Your Workspace</Text>
                                </View>
                                <View style={styles.addBtnOuter}>
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#6c63ff', borderRadius: 14 }]} />
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#38bdf8', opacity: 0.4, borderRadius: 14 }]} />
                                    <TouchableOpacity style={styles.addBtnTouch}>
                                        <Plus color="#fff" size={20} strokeWidth={2.5} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Stat cards */}
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={{ marginBottom: 28 }}
                                contentContainerStyle={{ paddingLeft: 20, paddingRight: 8 }}
                            >
                                <StatCard label="Total Tasks" value={total} bgColor="#1c1040" glowColor="rgba(108,99,255,0.5)" icon={<BarChart3 color="#a78bfa" size={20} strokeWidth={2} />} />
                                <View style={{ width: 12 }} />
                                <StatCard label="Completed" value={completed} bgColor="#0d2a1e" glowColor="rgba(52,211,153,0.45)" icon={<CheckCircle2 color="#34d399" size={20} strokeWidth={2} />} />
                                <View style={{ width: 12 }} />
                                <StatCard label="Pending" value={pending} bgColor="#0b1e30" glowColor="rgba(56,189,248,0.45)" icon={<Clock color="#38bdf8" size={20} strokeWidth={2} />} />
                                <View style={{ width: 12 }} />
                                <StatCard label="AI Powered" value="∞" bgColor="#281300" glowColor="rgba(251,146,60,0.45)" icon={<Sparkles color="#fb923c" size={20} strokeWidth={2} />} />
                                <View style={{ width: 4 }} />
                            </ScrollView>

                            {/* Section heading */}
                            <View style={styles.sectionRow}>
                                <View style={styles.sectionLeft}>
                                    <Zap color="#6c63ff" size={15} strokeWidth={2.5} />
                                    <Text style={styles.sectionTitle}>Active Tasks</Text>
                                </View>
                                <TouchableOpacity style={styles.sectionRight}>
                                    <Text style={styles.seeAll}>See all</Text>
                                    <ChevronRight color="#6c63ff" size={13} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <TaskCard item={item} onDelete={() => cancelTask.mutate(item.id)} />
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyWrap}>
                            <View style={styles.emptyCard}>
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(108,99,255,0.1)', borderRadius: 22 }]} />
                                <Sparkles color="#6c63ff" size={38} strokeWidth={1.5} />
                                <Text style={styles.emptyTitle}>No tasks yet</Text>
                                <Text style={styles.emptyBody}>Tap + to create your first task and let Sora AI handle it.</Text>
                            </View>
                        </View>
                    }
                />
            )}
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    root: { flex: 1 },
    blob: { position: 'absolute', width: 300, height: 300, borderRadius: 150 },

    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#64748b', fontSize: 14, marginTop: 12 },

    listContent: { paddingBottom: 48 },

    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 20 : 16,
        paddingBottom: 24,
    },
    greeting: { fontSize: 13, color: '#64748b', marginBottom: 4 },
    pageTitle: { fontSize: 26, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.8 },

    addBtnOuter: { width: 44, height: 44, borderRadius: 14, overflow: 'hidden', position: 'relative' },
    addBtnTouch: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },

    // Stat
    statCard: {
        borderRadius: 18, padding: 16,
        overflow: 'hidden', position: 'relative',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
        minHeight: 112, justifyContent: 'flex-end',
    },
    statGlow: { position: 'absolute', top: -28, right: -18, width: 80, height: 80, borderRadius: 40, opacity: 0.55 },
    statIconWrap: { marginBottom: 10 },
    statValue: { fontSize: 30, fontWeight: '800', color: '#f1f5f9', letterSpacing: -1 },
    statLabel: { fontSize: 11, color: 'rgba(241,245,249,0.45)', marginTop: 2, fontWeight: '500' },

    // Section header
    sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 },
    sectionLeft: { flexDirection: 'row', alignItems: 'center' },
    sectionRight: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#f1f5f9', marginLeft: 6 },
    seeAll: { fontSize: 12, color: '#6c63ff', fontWeight: '600' },

    // Task card
    taskWrap: { marginBottom: 12, marginHorizontal: 20 },
    taskGlass: {
        flexDirection: 'row', borderRadius: 16, overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    },
    taskAccent: { width: 3, minHeight: 62, position: 'relative', overflow: 'hidden' },
    taskInner: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 14, paddingLeft: 12 },
    taskTitle: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', letterSpacing: -0.2, marginBottom: 7 },
    taskMeta: { flexDirection: 'row', alignItems: 'center' },
    taskTime: { fontSize: 10.5, color: '#475569', marginLeft: 8 },
    deleteBtn: { padding: 6 },

    // Badge
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 10.5, fontWeight: '600', textTransform: 'capitalize', marginLeft: 4 },

    // Empty
    emptyWrap: { paddingHorizontal: 20, marginTop: 16 },
    emptyCard: { borderRadius: 22, padding: 36, alignItems: 'center', position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(108,99,255,0.18)' },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#e2e8f0', marginTop: 8 },
    emptyBody: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20, marginTop: 4 },
});
