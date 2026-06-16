import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import type {
  CompanyData,
  CompanyField,
  EnrichResponse,
  FieldEnrichment,
} from './src/types';

type Step = 'input' | 'review' | 'confirm';
type EditableCompanyField =
  | CompanyField
  | 'registeredAddress.line1'
  | 'registeredAddress.line2'
  | 'registeredAddress.city'
  | 'registeredAddress.region'
  | 'registeredAddress.postalCode'
  | 'registeredAddress.country';
type ReviewFieldConfig = {
  key: EditableCompanyField;
  metadataKey: CompanyField;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REVIEW_FIELDS: ReviewFieldConfig[] = [
  {
    key: 'name',
    metadataKey: 'name',
    label: 'Company name',
    placeholder: 'Company name',
  },
  {
    key: 'registrationNumber',
    metadataKey: 'registrationNumber',
    label: 'Registration number',
    placeholder: 'Registration number',
  },
  {
    key: 'registeredAddress.line1',
    metadataKey: 'registeredAddress',
    label: 'Registered address line 1',
    placeholder: 'Address line 1',
  },
  {
    key: 'registeredAddress.line2',
    metadataKey: 'registeredAddress',
    label: 'Registered address line 2',
    placeholder: 'Address line 2',
  },
  {
    key: 'registeredAddress.city',
    metadataKey: 'registeredAddress',
    label: 'City',
    placeholder: 'City',
  },
  {
    key: 'registeredAddress.region',
    metadataKey: 'registeredAddress',
    label: 'Region',
    placeholder: 'Region',
  },
  {
    key: 'registeredAddress.postalCode',
    metadataKey: 'registeredAddress',
    label: 'Postal code',
    placeholder: 'Postal code',
    keyboardType: 'numbers-and-punctuation',
  },
  {
    key: 'registeredAddress.country',
    metadataKey: 'registeredAddress',
    label: 'Country',
    placeholder: 'Country',
  },
  {
    key: 'incorporationDate',
    metadataKey: 'incorporationDate',
    label: 'Incorporation date',
    placeholder: 'YYYY-MM-DD',
    keyboardType: 'numbers-and-punctuation',
  },
  {
    key: 'companyType',
    metadataKey: 'companyType',
    label: 'Company type',
    placeholder: 'Company type',
  },
  {
    key: 'industry',
    metadataKey: 'industry',
    label: 'Industry',
    placeholder: 'Industry',
  },
  {
    key: 'status',
    metadataKey: 'status',
    label: 'Status',
    placeholder: 'Status',
  },
];

function getWebsiteValidationError(rawWebsite: string): string | null {
  const website = rawWebsite.trim();
  if (!website) return 'Enter your company website.';

  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    const hostname = url.hostname;
    const hostnameParts = hostname.split('.');

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      hostnameParts.length < 2 ||
      hostnameParts.some((part) => !part) ||
      /\s/.test(hostname)
    ) {
      return 'Enter a valid company website, like company.com.';
    }
  } catch {
    return 'Enter a valid company website, like company.com.';
  }

  return null;
}

function getInputValidationError(email: string, website: string): string | null {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return 'Enter your work email.';
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return 'Enter a valid work email, like you@company.com.';
  }

  return getWebsiteValidationError(website);
}

function getCompanyFieldValue(
  company: CompanyData,
  key: EditableCompanyField,
): string {
  switch (key) {
    case 'registeredAddress.line1':
      return company.registeredAddress?.line1 ?? '';
    case 'registeredAddress.line2':
      return company.registeredAddress?.line2 ?? '';
    case 'registeredAddress.city':
      return company.registeredAddress?.city ?? '';
    case 'registeredAddress.region':
      return company.registeredAddress?.region ?? '';
    case 'registeredAddress.postalCode':
      return company.registeredAddress?.postalCode ?? '';
    case 'registeredAddress.country':
      return company.registeredAddress?.country ?? '';
    case 'registeredAddress':
      return '';
    default:
      return company[key] ?? '';
  }
}

function updateCompanyField(
  company: CompanyData,
  key: EditableCompanyField,
  value: string,
): CompanyData {
  switch (key) {
    case 'registeredAddress.line1':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, line1: value },
      };
    case 'registeredAddress.line2':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, line2: value },
      };
    case 'registeredAddress.city':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, city: value },
      };
    case 'registeredAddress.region':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, region: value },
      };
    case 'registeredAddress.postalCode':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, postalCode: value },
      };
    case 'registeredAddress.country':
      return {
        ...company,
        registeredAddress: { ...company.registeredAddress, country: value },
      };
    case 'registeredAddress':
      return company;
    default:
      return { ...company, [key]: value };
  }
}

function formatSources(metadata?: FieldEnrichment): string {
  return metadata?.sources.length
    ? metadata.sources.join(', ')
    : 'No source returned';
}

function formatConfidence(metadata?: FieldEnrichment): string {
  return metadata ? metadata.confidence : 'unknown';
}

export default function App() {
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
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
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
  const submitDisabled = props.loading;

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
          returnKeyType="next"
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
          returnKeyType="done"
          style={styles.input}
          onSubmitEditing={props.onSubmit}
        />
      </View>

      <Pressable
        onPress={props.onSubmit}
        disabled={submitDisabled}
        style={({ pressed }) => [
          styles.button,
          submitDisabled && styles.buttonDisabled,
          pressed && !submitDisabled && styles.buttonPressed,
        ]}
      >
        {props.loading ? (
          <View style={styles.loadingContent}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.buttonText}>Checking details...</Text>
          </View>
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

function ReviewStep(props: {
  company: CompanyData;
  enrichment: EnrichResponse['enrichment']['fields'];
  onChangeCompany: (company: CompanyData) => void;
  onConfirm: () => void;
}) {
  return (
    <View>
      <Text style={styles.h1}>Review your details</Text>
      <Text style={styles.subtitle}>
        We've pulled this in for you. Check it over before continuing.
      </Text>

      <View style={styles.reviewList}>
        {REVIEW_FIELDS.map((field) => {
          const metadata = props.enrichment[field.metadataKey];

          return (
            <ReviewField
              key={field.key}
              config={field}
              metadata={metadata}
              value={getCompanyFieldValue(props.company, field.key)}
              onChange={(value) =>
                props.onChangeCompany(
                  updateCompanyField(props.company, field.key, value),
                )
              }
            />
          );
        })}
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

function ReviewField(props: {
  config: ReviewFieldConfig;
  metadata?: FieldEnrichment;
  value: string;
  onChange: (value: string) => void;
}) {
  const isLowConfidence = props.metadata?.confidence === 'low';

  return (
    <View style={[styles.reviewField, isLowConfidence && styles.lowConfidence]}>
      <View style={styles.reviewFieldHeader}>
        <Text style={styles.label}>{props.config.label}</Text>
        <Text
          style={[
            styles.confidenceBadge,
            isLowConfidence && styles.lowConfidenceBadge,
          ]}
        >
          {formatConfidence(props.metadata)}
        </Text>
      </View>

      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.config.placeholder}
        autoCapitalize="words"
        autoCorrect={false}
        keyboardType={props.config.keyboardType ?? 'default'}
        returnKeyType="next"
        style={styles.input}
      />

      <View style={styles.metadataRow}>
        <Text style={styles.metadataText}>
          Source: {formatSources(props.metadata)}
        </Text>
        {props.metadata?.reason ? (
          <Text style={styles.reasonText}>{props.metadata.reason}</Text>
        ) : null}
      </View>
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
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 32, paddingBottom: 40 },
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
    minHeight: 50,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 8,
  },
  buttonDisabled: { backgroundColor: '#9bb6f0' },
  buttonPressed: { opacity: 0.85 },
  loadingContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  reviewList: { gap: 12, marginBottom: 16 },
  reviewField: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  lowConfidence: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  reviewFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  confidenceBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: '#eef2ff',
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  lowConfidenceBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  metadataRow: { marginTop: 8, gap: 4 },
  metadataText: { color: '#4b5563', fontSize: 12 },
  reasonText: { color: '#6b7280', fontSize: 12, lineHeight: 17 },
  confirmBox: { paddingTop: 80, alignItems: 'center' },
});
