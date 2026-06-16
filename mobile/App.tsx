import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { enrich } from "./src/api";
import { ConfirmStep } from "./src/components/ConfirmStep";
import { InputStep } from "./src/components/InputStep";
import { ReviewStep } from "./src/components/ReviewStep";
import {
  clearPersistedOnboardingState,
  loadPersistedOnboardingState,
  savePersistedOnboardingState,
} from "./src/persistence";
import { styles } from "./src/styles";
import type { CompanyData, EnrichResponse } from "./src/types";
import {
  getEmailValidationError,
  getWebsiteValidationError,
} from "./src/validation";

type Step = "input" | "review" | "confirm";

const STEP_ORDER: Step[] = ["input", "review", "confirm"];

const pageTitles: Record<Step, string> = {
  input: "Company Onboarding",
  review: "Review your details",
  confirm: "Confirm details",
};

const SLIDE_DURATION = 300;
const SLIDE_EASING = Easing.bezier(0.25, 0.46, 0.45, 0.94);

export default function App() {
  return (
    <SafeAreaProvider>
      <OnboardingFlow />
    </SafeAreaProvider>
  );
}

function OnboardingFlow() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + 56;

  const [activeStep, setActiveStep] = useState<Step>("input");
  const [leavingStep, setLeavingStep] = useState<Step | null>(null);
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichResponse | null>(null);
  const [editedCompany, setEditedCompany] = useState<CompanyData>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasRestoredState, setHasRestoredState] = useState(false);

  const reviewScrollViewRef = useRef<ScrollView>(null);
  const submittingRef = useRef(false);
  const savingRef = useRef(false);
  const enrichAbortRef = useRef<AbortController | null>(null);
  const isAnimatingRef = useRef(false);
  const persistencePromiseRef = useRef<Promise<void>>(Promise.resolve());
  const enteringTranslateX = useRef(new Animated.Value(0)).current;
  const leavingTranslateX = useRef(new Animated.Value(0)).current;

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
        setActiveStep(persistedState.step);
        setSaved(persistedState.saved);
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
    if (!hasRestoredState) return;

    persistencePromiseRef.current = persistencePromiseRef.current
      .catch(() => undefined)
      .then(() =>
        savePersistedOnboardingState({
          version: 1,
          step: activeStep,
          email,
          website,
          result,
          editedCompany,
          saved,
        }),
      );
  }, [editedCompany, email, hasRestoredState, result, activeStep, website, saved]);

  const navigateTo = useCallback(
    (newStep: Step) => {
      if (isAnimatingRef.current) return;

      const direction =
        STEP_ORDER.indexOf(newStep) > STEP_ORDER.indexOf(activeStep) ? 1 : -1;

      isAnimatingRef.current = true;
      enteringTranslateX.setValue(direction * screenWidth);
      leavingTranslateX.setValue(0);
      setLeavingStep(activeStep);
      setActiveStep(newStep);

      Animated.parallel([
        Animated.timing(enteringTranslateX, {
          toValue: 0,
          duration: SLIDE_DURATION,
          easing: SLIDE_EASING,
          useNativeDriver: true,
        }),
        Animated.timing(leavingTranslateX, {
          toValue: -direction * screenWidth,
          duration: SLIDE_DURATION,
          easing: SLIDE_EASING,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setLeavingStep(null);
        enteringTranslateX.setValue(0);
        isAnimatingRef.current = false;
      });
    },
    [activeStep, screenWidth, enteringTranslateX, leavingTranslateX],
  );

  const handleSubmit = async () => {
    if (submittingRef.current) return;

    const newEmailError = getEmailValidationError(email);
    const newWebsiteError = getWebsiteValidationError(website);
    setEmailError(newEmailError);
    setWebsiteError(newWebsiteError);
    if (newEmailError || newWebsiteError) return;

    submittingRef.current = true;
    setLoading(true);
    setSubmitError(null);

    const controller = new AbortController();
    enrichAbortRef.current = controller;

    try {
      const data = await enrich(
        { email: email.trim(), website: website.trim() },
        controller.signal,
      );
      setResult(data);
      setEditedCompany(data.company);
      setSaved(false);
      navigateTo("review");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User tapped Cancel — clear state silently, no error banner.
        return;
      }
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : "We could not continue. Please try again.",
      );
    } finally {
      enrichAbortRef.current = null;
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const handleCancelEnrich = () => {
    enrichAbortRef.current?.abort();
  };

  const handleReviewConfirm = () => {
    setSaved(false);
    navigateTo("confirm");
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
    enteringTranslateX.stopAnimation();
    leavingTranslateX.stopAnimation();
    enteringTranslateX.setValue(0);
    leavingTranslateX.setValue(0);
    isAnimatingRef.current = false;

    await clearPersistedOnboardingState();
    setLeavingStep(null);
    setActiveStep("input");
    setEmail("");
    setWebsite("");
    setEmailError(null);
    setWebsiteError(null);
    setSubmitError(null);
    setResult(null);
    setEditedCompany({});
    setSaved(false);
    setSaving(false);
    savingRef.current = false;
  };

  const handleBack = () => {
    if (saving || saved) return;

    if (activeStep === "confirm") {
      navigateTo(result ? "review" : "input");
      return;
    }

    if (activeStep === "review") {
      navigateTo("input");
    }
  };

  const canGoBack = activeStep !== "input" && !saved && !saving;
  const pageTitle =
    activeStep === "confirm" && saved
      ? "You're all set"
      : pageTitles[activeStep];

  if (!hasRestoredState) {
    return (
      <View style={styles.safe}>
        <StatusBar style="auto" />
      </View>
    );
  }

  const scrollPadding = {
    paddingTop: headerHeight + 24,
    paddingBottom: insets.bottom + 40,
  };

  const renderScreen = (
    step: Step,
    translateX: Animated.Value,
    isLeaving: boolean,
  ) => (
    <Animated.View
      key={step}
      style={[slideStyles.screen, { transform: [{ translateX }] }]}
      pointerEvents={isLeaving ? "none" : "box-none"}
    >
      <KeyboardAvoidingView
        style={slideStyles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={step === "review" ? reviewScrollViewRef : undefined}
          contentContainerStyle={[styles.scroll, scrollPadding]}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          keyboardShouldPersistTaps="handled"
        >
          {step === "input" && (
            <InputStep
              email={email}
              website={website}
              loading={loading}
              emailError={emailError}
              websiteError={websiteError}
              submitError={submitError}
              onChangeEmail={(value) => {
                setEmail(value);
                if (emailError) setEmailError(null);
              }}
              onChangeWebsite={(value) => {
                setWebsite(value);
                if (websiteError) setWebsiteError(null);
              }}
              onSubmit={handleSubmit}
              onCancel={handleCancelEnrich}
            />
          )}

          {step === "review" && result && (
            <ReviewStep
              company={editedCompany}
              originalCompany={result.company}
              enrichment={result.enrichment.fields}
              warnings={result.enrichment.warnings}
              onChangeCompany={setEditedCompany}
              onConfirm={handleReviewConfirm}
              scrollViewRef={reviewScrollViewRef}
              scrollTopOffset={headerHeight}
            />
          )}

          {step === "confirm" && result && (
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
    </Animated.View>
  );

  return (
    <View style={styles.safe}>
      <StatusBar style="auto" />
      <View style={slideStyles.container}>
        {leavingStep !== null &&
          renderScreen(leavingStep, leavingTranslateX, true)}
        {renderScreen(activeStep, enteringTranslateX, false)}
      </View>
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

const slideStyles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
  fill: {
    flex: 1,
  },
});

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
          <Text style={styles.headerBackText}>{"‹"}</Text>
        </Pressable>
      ) : (
        <View style={styles.headerBackButtonPlaceholder} />
      )}
      <Text style={styles.pageHeaderTitle}>{props.title}</Text>
      <View style={styles.headerBackButtonPlaceholder} />
    </View>
  );
}
