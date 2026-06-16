import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  formatSources,
  getCompanyFieldValue,
  updateCompanyField,
} from '../company';
import { REGISTERED_ADDRESS_FIELDS, REVIEW_FIELDS } from '../reviewFields';
import { styles } from '../styles';
import type { CompanyData, EnrichResponse } from '../types';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { ReviewField } from './ReviewField';

export function ReviewStep(props: {
  company: CompanyData;
  originalCompany: CompanyData;
  enrichment: EnrichResponse['enrichment']['fields'];
  warnings?: string[];
  onChangeCompany: (company: CompanyData) => void;
  onConfirm: () => void;
  scrollViewRef: React.RefObject<ScrollView | null>;
  scrollTopOffset: number;
}) {
  const [submitted, setSubmitted] = useState(false);
  const fieldRefs = useRef<Partial<Record<string, View | null>>>({});
  const addressGroupRef = useRef<View | null>(null);
  const warnings = props.warnings?.filter(Boolean) ?? [];
  const registeredAddressMetadata = props.enrichment.registeredAddress;

  const isFieldEdited = (key: Parameters<typeof getCompanyFieldValue>[1]) =>
    getCompanyFieldValue(props.company, key) !==
    getCompanyFieldValue(props.originalCompany, key);

  const isAddressGroupEdited = REGISTERED_ADDRESS_FIELDS.some((f) =>
    isFieldEdited(f.key),
  );

  const emptyRequiredKeys = submitted
    ? new Set(
        REVIEW_FIELDS.filter(
          (f) => f.required && !getCompanyFieldValue(props.company, f.key).trim(),
        ).map((f) => f.key),
      )
    : new Set<string>();

  const scrollToFirstError = (firstErrorKey: string, isAddressField: boolean) => {
    const target = isAddressField
      ? addressGroupRef.current
      : fieldRefs.current[firstErrorKey];
    const scrollView = props.scrollViewRef.current;
    if (!target || !scrollView) return;
    target.measureLayout(
      scrollView as unknown as View,
      (_x, y) => {
        props.scrollViewRef.current?.scrollTo({
          y: Math.max(0, y - props.scrollTopOffset - 16),
          animated: true,
        });
      },
      () => {},
    );
  };

  const handleConfirm = () => {
    setSubmitted(true);
    const firstError = REVIEW_FIELDS.find(
      (f) => f.required && !getCompanyFieldValue(props.company, f.key).trim(),
    );
    if (!firstError) {
      props.onConfirm();
      return;
    }
    const isAddressField = firstError.metadataKey === 'registeredAddress';
    requestAnimationFrame(() => scrollToFirstError(firstError.key, isAddressField));
  };

  const registeredAddressGroup = (
    <View
      key="registeredAddress"
      ref={addressGroupRef}
      style={styles.reviewFieldGroup}
    >
      <View style={styles.reviewFieldHeader}>
        <Text style={styles.label}>Registered address</Text>
        <ConfidenceIndicator
          confidence={registeredAddressMetadata?.confidence}
          isEdited={isAddressGroupEdited}
        />
      </View>

      <View style={styles.groupedReviewFields}>
        {REGISTERED_ADDRESS_FIELDS.map((field) => (
          <ReviewField
            key={field.key}
            config={field}
            metadata={registeredAddressMetadata}
            value={getCompanyFieldValue(props.company, field.key)}
            grouped
            showMetadata={false}
            hasError={emptyRequiredKeys.has(field.key)}
            onChange={(value) =>
              props.onChangeCompany(
                updateCompanyField(props.company, field.key, value),
              )
            }
          />
        ))}
      </View>

      {!isAddressGroupEdited ? (
        <View style={styles.metadataRow}>
          <Text style={styles.metadataText}>
            Source: {formatSources(registeredAddressMetadata)}
          </Text>
          {registeredAddressMetadata?.reason ? (
            <Text style={styles.reasonText}>
              {registeredAddressMetadata.reason}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View>
      <Text style={styles.subtitle}>
        We've pulled this in for you. Check it over before continuing.
      </Text>

      {warnings.length > 0 ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Needs a quick check</Text>
          {warnings.map((warning) => (
            <Text key={warning} style={styles.warningText}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.reviewList}>
        {REVIEW_FIELDS.map((field) => {
          if (field.metadataKey === 'registeredAddress') {
            return field.key === REGISTERED_ADDRESS_FIELDS[0]?.key
              ? registeredAddressGroup
              : null;
          }

          const metadata = props.enrichment[field.metadataKey];

          return (
            <ReviewField
              key={field.key}
              config={field}
              metadata={metadata}
              value={getCompanyFieldValue(props.company, field.key)}
              hasError={emptyRequiredKeys.has(field.key)}
              isEdited={isFieldEdited(field.key)}
              viewRef={(ref: View | null) => {
                fieldRefs.current[field.key] = ref;
              }}
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
        onPress={handleConfirm}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Looks good</Text>
      </Pressable>
    </View>
  );
}
