import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { enrich } from './src/api';
import { ConfirmStep } from './src/components/ConfirmStep';
import { InputStep } from './src/components/InputStep';
import { ReviewStep } from './src/components/ReviewStep';
import {
  clearPersistedOnboardingState,
  loadPersistedOnboardingState,
  savePersistedOnboardingState,
} from './src/persistence';
import { styles } from './src/styles';
import type { CompanyData, EnrichResponse } from './src/types';
import { getInputValidationError } from './src/validation';

type Step = 'input' | 'review' | 'confirm';

const pageTitles: Record<Step, string> = {
  input: 'Company Onboarding',
  review: 'Review your details',
  confirm: "You're all set",
};

export default function App() {
  return (
    <SafeAreaProvider>
      <OnboardingFlow />
    </SafeAreaProvider>
  );
}

function OnboardingFlow() {
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;
  const [step, setStep] = useState<Step>('input');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichResponse | null>(null);
  const [editedCompany, setEditedCompany] = useState<CompanyData>({});
  const [hasRestoredState, setHasRestoredState] = useState(false);
  const submittingRef = useRef(false);
  const persistencePromiseRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    async function restoreState() {
      const persistedState = await loadPersistedOnboardingState();
      if (cancelled) return;

      if (persistedState) {
        setEmail(persistedState.email);
        setWebsite(persistedState.website);
        setResult(persistedState.result);
        setEditedCompany(persistedState.editedCompany);
        setStep(persistedState.step);
      }

      setHasRestoredState(true);
    }

    restoreState().catch(() => {
      if (!cancelled) setHasRestoredState(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasRestoredState || step === 'confirm') return;

    persistencePromiseRef.current = persistencePromiseRef.current
      .catch(() => undefined)
      .then(() =>
        savePersistedOnboardingState({
          version: 1,
          step,
          email,
          website,
          result,
          editedCompany,
        }),
      );
  }, [editedCompany, email, hasRestoredState, result, step, website]);

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

  const handleConfirm = async () => {
    // TODO (candidate): in a real app this would POST to a save endpoint.
    const confirmedResult = result
      ? { ...result, company: editedCompany }
      : result;

    try {
      await persistencePromiseRef.current.catch(() => undefined);
      await clearPersistedOnboardingState();
    } finally {
      if (confirmedResult) {
        setResult(confirmedResult);
      }
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep(result ? 'review' : 'input');
      return;
    }

    if (step === 'review') {
      setStep('input');
    }
  };

  const canGoBack = step !== 'input';

  if (!hasRestoredState) {
    return (
      <View style={styles.safe}>
        <StatusBar style="auto" />
      </View>
    );
  }

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
              paddingTop: headerHeight + 24,
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
        intensity={70}
        tint="light"
        style={[
          styles.topBlur,
          { height: headerHeight, paddingTop: insets.top },
        ]}
      >
        <PageHeader
          title={pageTitles[step]}
          onBack={canGoBack ? handleBack : undefined}
        />
      </BlurView>
    </View>
  );
}

function PageHeader(props: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.pageHeader}>
      {props.onBack ? (
        <Pressable
          onPress={props.onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerBackButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.headerBackText}>{'‹'}</Text>
        </Pressable>
      ) : (
        <View style={styles.headerBackButtonPlaceholder} />
      )}
      <Text style={styles.pageHeaderTitle}>{props.title}</Text>
      <View style={styles.headerBackButtonPlaceholder} />
    </View>
  );
}
