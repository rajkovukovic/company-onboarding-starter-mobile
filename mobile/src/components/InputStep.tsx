import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { styles } from '../styles';
import { AppTextInput } from './AppTextInput';

export function InputStep(props: {
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
      <Text style={styles.subtitle}>
        Enter your details and we'll fill in the rest
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Work Email</Text>
        <AppTextInput
          value={props.email}
          onChangeText={props.onChangeEmail}
          placeholder="you@company.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Company Website</Text>
        <AppTextInput
          value={props.website}
          onChangeText={props.onChangeWebsite}
          placeholder="https://company.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          returnKeyType="done"
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
