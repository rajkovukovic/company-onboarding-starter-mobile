import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, useWindowDimensions } from "react-native";

import { enrich } from "../api";
import {
  clearPersistedOnboardingState,
  loadPersistedOnboardingState,
  savePersistedOnboardingState,
} from "../persistence";
import { pageTitles, STEP_ORDER, type Step } from "../steps";
import type { CompanyData, EnrichResponse } from "../types";
import {
  getEmailValidationError,
  getWebsiteValidationError,
} from "../validation";

const SLIDE_DURATION = 300;
const SLIDE_EASING = Easing.bezier(0.25, 0.46, 0.45, 0.94);

export function useOnboardingFlow() {
  const { width: screenWidth } = useWindowDimensions();

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

  return {
    activeStep,
    leavingStep,
    email,
    setEmail,
    website,
    setWebsite,
    loading,
    emailError,
    setEmailError,
    websiteError,
    setWebsiteError,
    submitError,
    result,
    editedCompany,
    setEditedCompany,
    saving,
    saved,
    hasRestoredState,
    reviewScrollViewRef,
    enteringTranslateX,
    leavingTranslateX,
    canGoBack,
    pageTitle,
    handleSubmit,
    handleCancelEnrich,
    handleReviewConfirm,
    handleConfirm,
    handleStartOver,
    handleBack,
  };
}
