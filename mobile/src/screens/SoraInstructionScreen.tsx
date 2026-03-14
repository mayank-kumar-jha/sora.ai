import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { MessageSquare, Shield, Zap, CheckCircle, ExternalLink } from 'lucide-react-native';
import AssistantFace from '../animations/AssistantFace';

export default function SoraInstructionScreen() {
    const openWhatsApp = () => {
        Linking.openURL('https://wa.me/?text=Hello%20Sora!');
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <AssistantFace state="Happy" scale={1.5} />
                <Text style={styles.title}>Welcome to Sora AI</Text>
                <Text style={styles.subtitle}>Your powerful, private AI assistant</Text>
            </View>

            <View style={styles.card}>
                <View style={styles.cardHeader}>
                    <MessageSquare color="#a78bfa" size={24} />
                    <Text style={styles.cardTitle}>WhatsApp Integration</Text>
                </View>
                <Text style={styles.cardText}>
                    Control your digital life directly from WhatsApp. Send messages, schedule tasks, and get summaries without leaving your favorite chat app.
                </Text>
                <TouchableOpacity style={styles.button} onPress={openWhatsApp}>
                    <Text style={styles.buttonText}>Connect WhatsApp</Text>
                    <ExternalLink color="#fff" size={18} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>How to use Sora</Text>

                <View style={styles.step}>
                    <View style={styles.stepIcon}>
                        <Zap color="#0df" size={18} />
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Dynamic Island</Text>
                        <Text style={styles.stepText}>Tap the floating capsule at the top to talk to Sora or see active tasks.</Text>
                    </View>
                </View>

                <View style={styles.step}>
                    <View style={styles.stepIcon}>
                        <Shield color="#0df" size={18} />
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Privacy First</Text>
                        <Text style={styles.stepText}>Sora processes your data securely and respects your privacy at every step.</Text>
                    </View>
                </View>

                <View style={styles.step}>
                    <View style={styles.stepIcon}>
                        <CheckCircle color="#0df" size={18} />
                    </View>
                    <View style={styles.stepContent}>
                        <Text style={styles.stepTitle}>Smart Automation</Text>
                        <Text style={styles.stepText}>Ask Sora to set alarms, take notes, or search the web for you.</Text>
                    </View>
                </View>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Version 1.0.0 • Powered by Super AI</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#080a12',
    },
    content: {
        padding: 24,
        paddingTop: 60,
        paddingBottom: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
        marginTop: 16,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#94a3b8',
        marginTop: 8,
        textAlign: 'center',
    },
    card: {
        backgroundColor: '#111422',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#1e293b',
        marginBottom: 32,
        shadowColor: '#a78bfa',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#e0e8ff',
        marginLeft: 10,
    },
    cardText: {
        fontSize: 14,
        color: '#94a3b8',
        lineHeight: 22,
        marginBottom: 20,
    },
    button: {
        backgroundColor: '#7c3aed',
        borderRadius: 12,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 20,
    },
    step: {
        flexDirection: 'row',
        marginBottom: 24,
    },
    stepIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#1e293b',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    stepContent: {
        flex: 1,
    },
    stepTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#e0e8ff',
        marginBottom: 4,
    },
    stepText: {
        fontSize: 14,
        color: '#64748b',
        lineHeight: 20,
    },
    footer: {
        marginTop: 20,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
        paddingTop: 24,
    },
    footerText: {
        fontSize: 12,
        color: '#475569',
    },
});
