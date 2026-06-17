import { Animated, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { BlurView } from "expo-blur";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmStep } from "./src/components/ConfirmStep";
import { InputStep } from "./src/components/InputStep";
import { PageHeader } from "./src/components/PageHeader";
import { ReviewStep } from "./src/components/ReviewStep";
import { useOnboardingFlow } from "./src/hooks/useOnboardingFlow";
import type { Step } from "./src/steps";
import { slideStyles, styles } from "./src/styles";

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

  const {
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
  } = useOnboardingFlow();

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
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
        {leavingStep !== null && renderScreen(leavingStep, leavingTranslateX, true)}
        {renderScreen(activeStep, enteringTranslateX, false)}
      </View>
      <BlurView
        intensity={70}
        tint="light"
        style={[styles.topBlur, { height: headerHeight, paddingTop: insets.top }]}
      >
        <PageHeader
          title={pageTitle}
          onBack={canGoBack ? handleBack : undefined}
        />
      </BlurView>
    </View>
  );
}
