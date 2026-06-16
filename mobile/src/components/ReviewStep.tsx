import { Pressable, Text, View } from 'react-native';

import {
  formatConfidence,
  formatSources,
  getCompanyFieldValue,
  updateCompanyField,
} from '../company';
import { REGISTERED_ADDRESS_FIELDS, REVIEW_FIELDS } from '../reviewFields';
import { styles } from '../styles';
import type { CompanyData, EnrichResponse } from '../types';
import { ReviewField } from './ReviewField';

export function ReviewStep(props: {
  company: CompanyData;
  enrichment: EnrichResponse['enrichment']['fields'];
  warnings?: string[];
  onChangeCompany: (company: CompanyData) => void;
  onConfirm: () => void;
}) {
  const warnings = props.warnings?.filter(Boolean) ?? [];
  const registeredAddressMetadata = props.enrichment.registeredAddress;
  const isRegisteredAddressLowConfidence =
    registeredAddressMetadata?.confidence === 'low';
  const registeredAddressGroup = (
    <View
      key="registeredAddress"
      style={[
        styles.reviewFieldGroup,
        isRegisteredAddressLowConfidence && styles.lowConfidence,
      ]}
    >
      <View style={styles.reviewFieldHeader}>
        <Text style={styles.label}>Registered address</Text>
        <Text
          style={[
            styles.confidenceBadge,
            isRegisteredAddressLowConfidence && styles.lowConfidenceBadge,
          ]}
        >
          {formatConfidence(registeredAddressMetadata)}
        </Text>
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
            onChange={(value) =>
              props.onChangeCompany(
                updateCompanyField(props.company, field.key, value),
              )
            }
          />
        ))}
      </View>

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
