import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { enrich } from './src/api';
import type { EnrichResponse } from './src/types';

type Step = 'input' | 'review' | 'confirm';

export default function App() {
  const [step, setStep] = useState<Step>('input');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichResponse | null>(null);

  // TODO (candidate): the in-progress flow should survive the app being
  // backgrounded or killed. If the user closes the app on the Review step,
  // they should resume there (with their edits) when they reopen it.
  // Pick a persistence library (AsyncStorage, MMKV, SecureStore...) and
  // wire it up. Be intentional about what you persist and when you clear it.

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await enrich({ email, website });
      setResult(data);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    // TODO (candidate): in a real app this would POST to a save endpoint.
    setStep('confirm');
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'input' && (
            <InputStep
              email={email}
              website={website}
              loading={loading}
              error={error}
              onChangeEmail={setEmail}
              onChangeWebsite={setWebsite}
              onSubmit={handleSubmit}
            />
          )}

          {step === 'review' && result && (
            <ReviewStep result={result} onConfirm={handleConfirm} />
          )}

          {step === 'confirm' && <ConfirmStep />}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function InputStep(props: {
  email: string;
  website: string;
  loading: boolean;
  error: string | null;
  onChangeEmail: (value: string) => void;
  onChangeWebsite: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <View>
      <Text style={styles.h1}>Company Onboarding</Text>
      <Text style={styles.subtitle}>
        Enter your details and we'll fill in the rest
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Work Email</Text>
        <TextInput
          value={props.email}
          onChangeText={props.onChangeEmail}
          placeholder="you@company.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Company Website</Text>
        <TextInput
          value={props.website}
          onChangeText={props.onChangeWebsite}
          placeholder="https://company.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          style={styles.input}
        />
      </View>

      <Pressable
        onPress={props.onSubmit}
        disabled={props.loading || !props.email || !props.website}
        style={({ pressed }) => [
          styles.button,
          (props.loading || !props.email || !props.website) &&
            styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        {props.loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continue</Text>
        )}
      </Pressable>

      {props.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{props.error}</Text>
        </View>
      )}
    </View>
  );
}

function ReviewStep(props: { result: EnrichResponse; onConfirm: () => void }) {
  // TODO (candidate): replace this JSON dump with a proper review UI.
  // - Show each field with its source and confidence
  // - Highlight low-confidence fields
  // - Make fields editable so the user can correct mistakes
  return (
    <View>
      <Text style={styles.h1}>Review your details</Text>
      <Text style={styles.subtitle}>
        We've pulled this in for you. Check it over before continuing.
      </Text>

      <View style={styles.jsonBox}>
        <Text style={styles.jsonText}>
          {JSON.stringify(props.result, null, 2)}
        </Text>
      </View>

      <Pressable
        onPress={props.onConfirm}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Looks good</Text>
      </Pressable>
    </View>
  );
}

function ConfirmStep() {
  // TODO (candidate): make this feel like a real success screen.
  return (
    <View style={styles.confirmBox}>
      <Text style={styles.h1}>You're all set</Text>
      <Text style={styles.subtitle}>Company details saved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f8' },
  scroll: { padding: 20, paddingTop: 32 },
  h1: { fontSize: 28, fontWeight: '700', marginBottom: 8, color: '#111' },
  subtitle: { fontSize: 15, color: '#555', marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, color: '#333' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d6d6db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { backgroundColor: '#9bb6f0' },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: 10,
  },
  errorText: { color: '#b91c1c' },
  jsonBox: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  jsonText: { fontFamily: 'Menlo', fontSize: 12, color: '#111' },
  confirmBox: { paddingTop: 80, alignItems: 'center' },
});
