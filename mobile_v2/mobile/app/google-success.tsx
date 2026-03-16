import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, ArrowRight } from 'lucide-react-native';

export default function GoogleSuccessScreen() {
    const router = useRouter();

    useEffect(() => {
        // Automatically go back after some time if needed
    }, []);

    const handleContinue = () => {
        router.replace('/(tabs)/settings');
    };

    return (
        <LinearGradient colors={['#080a14', '#020617']} style={styles.container}>
            <View style={styles.card}>
                <CheckCircle2 color="#34d399" size={64} />
                <Text style={styles.title}>Account Linked!</Text>
                <Text style={styles.desc}>
                    Success! Your Google account is now securely connected to Sora.
                </Text>
                <Text style={styles.hint}>
                    Sora can now access your Calendar and Gmail to help you stay organized.
                </Text>

                <TouchableOpacity style={styles.button} onPress={handleContinue}>
                    <Text style={styles.buttonText}>Back to Settings</Text>
                    <ArrowRight color="#fff" size={18} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
            </View>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        width: '100%',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginTop: 16,
        marginBottom: 8,
    },
    desc: {
        fontSize: 16,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 24,
    },
    hint: {
        fontSize: 13,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 32,
        fontStyle: 'italic',
    },
    button: {
        backgroundColor: '#7c3aed',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 28,
        shadowColor: '#7c3aed',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
