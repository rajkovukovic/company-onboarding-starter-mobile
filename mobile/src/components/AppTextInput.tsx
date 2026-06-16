import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { palette, styles } from '../styles';

type FocusHandler = NonNullable<TextInputProps['onFocus']>;
type BlurHandler = NonNullable<TextInputProps['onBlur']>;

/**
 * Shared text input that recesses into white cards and lifts to a white fill
 * with an indigo border on focus, matching the Seapoint web app.
 */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(
  function AppTextInput({ style, onFocus, onBlur, editable = true, ...rest }, ref) {
    const [focused, setFocused] = useState(false);

    const handleFocus: FocusHandler = (e) => {
      setFocused(true);
      onFocus?.(e);
    };

    const handleBlur: BlurHandler = (e) => {
      setFocused(false);
      onBlur?.(e);
    };

    return (
      <TextInput
        ref={ref}
        editable={editable}
        placeholderTextColor={palette.textFaint}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={[
          styles.input,
          focused && editable && styles.inputFocused,
          !editable && styles.inputDisabled,
          style,
        ]}
        {...rest}
      />
    );
  },
);
