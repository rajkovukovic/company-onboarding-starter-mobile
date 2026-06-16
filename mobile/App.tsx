import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { enrich } from './src/api';
import { ConfirmStep } from './src/components/ConfirmStep';
import { InputStep } from './src/components/InputStep';
import { ReviewStep } from './src/components/ReviewStep';
import { styles } from './src/styles';
import type { CompanyData, EnrichResponse } from './src/types';
import { getInputValidationError } from './src/validation';

type Step = 'input' | 'review' | 'confirm';

export default function App() {
  return (
    <SafeAreaProvider>
      <OnboardingFlow />
    </SafeAreaProvider>
  );
}

function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('input');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichResponse | null>(null);
  const [editedCompany, setEditedCompany] = useState<CompanyData>({});
  const submittingRef = useRef(false);

  // TODO (candidate): the in-progress flow should survive the app being
  // backgrounded or killed. If the user closes the app on the Review step,
  // they should resume there (with their edits) when they reopen it.
  // Pick a persistence library (AsyncStorage, MMKV, SecureStore...) and
  // wire it up. Be intentional about what you persist and when you clear it.

  const handleSubmit = async () => {
    if (submittingRef.current) return;

    const validationError = getInputValidationError(email, website);
    if (validationError) {
      setError(validationError);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const data = await enrich({
        email: email.trim(),
        website: website.trim(),
      });
      setResult(data);
      setEditedCompany(data.company);
      setStep('review');
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'We could not continue. Please try again.',
      );
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    // TODO (candidate): in a real app this would POST to a save endpoint.
    if (result) {
      setResult({ ...result, company: editedCompany });
    }
    setStep('confirm');
  };

  return (
    <View style={styles.safe}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + 32,
              paddingBottom: insets.bottom + 40,
            },
          ]}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {step === 'input' && (
            <InputStep
              email={email}
              website={website}
              loading={loading}
              error={error}
              onChangeEmail={(value) => {
                setEmail(value);
                if (error) setError(null);
              }}
              onChangeWebsite={(value) => {
                setWebsite(value);
                if (error) setError(null);
              }}
              onSubmit={handleSubmit}
            />
          )}

          {step === 'review' && result && (
            <ReviewStep
              company={editedCompany}
              enrichment={result.enrichment.fields}
              onChangeCompany={setEditedCompany}
              onConfirm={handleConfirm}
            />
          )}

          {step === 'confirm' && <ConfirmStep />}
        </ScrollView>
      </KeyboardAvoidingView>
      <BlurView
        pointerEvents="none"
        intensity={70}
        tint="light"
        style={[styles.topBlur, { height: insets.top + 18 }]}
      />
    </View>
  );
}
