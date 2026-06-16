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
  confirm: 'Confirm details',
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasRestoredState, setHasRestoredState] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const submittingRef = useRef(false);
  const savingRef = useRef(false);
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

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [step]);

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
      setSaved(false);
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

  const handleReviewConfirm = () => {
    setSaved(false);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (savingRef.current || saved) return;

    // TODO (candidate): in a real app this would POST to a save endpoint.
    const confirmedResult = result
      ? { ...result, company: editedCompany }
      : result;

    savingRef.current = true;
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await persistencePromiseRef.current.catch(() => undefined);
      await clearPersistedOnboardingState();
      if (confirmedResult) {
        setResult(confirmedResult);
      }
      setSaved(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleStartOver = async () => {
    await clearPersistedOnboardingState();
    setStep('input');
    setEmail('');
    setWebsite('');
    setError(null);
    setResult(null);
    setEditedCompany({});
    setSaved(false);
    setSaving(false);
    savingRef.current = false;
  };

  const handleBack = () => {
    if (saving || saved) return;

    if (step === 'confirm') {
      setStep(result ? 'review' : 'input');
      return;
    }

    if (step === 'review') {
      setStep('input');
    }
  };

  const canGoBack = step !== 'input' && !saved && !saving;
  const pageTitle = step === 'confirm' && saved ? "You're all set" : pageTitles[step];

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
          ref={scrollViewRef}
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
              warnings={result.enrichment.warnings}
              onChangeCompany={setEditedCompany}
              onConfirm={handleReviewConfirm}
              scrollViewRef={scrollViewRef}
              scrollTopOffset={headerHeight}
            />
          )}

          {step === 'confirm' && result && (
            <ConfirmStep
              company={editedCompany}
              input={result.input}
              saving={saving}
              saved={saved}
              onSubmit={handleConfirm}
              onStartOver={handleStartOver}
            />
          )}
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
          title={pageTitle}
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
            pressed && styles.pressedFade,
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
