export const EMAIL_PATTERN = /^[^\s@]+@[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;

export function getWebsiteValidationError(rawWebsite: string): string | null {
  const website = rawWebsite.trim();
  if (!website) return 'Enter your company website.';

  if (website.includes('@')) {
    return 'Enter a valid company website, like company.com.';
  }

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

export function getEmailValidationError(email: string): string | null {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return 'Enter your work email.';
  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return 'Enter a valid work email, like you@company.com.';
  }
  return null;
}

export function getInputValidationError(email: string, website: string): string | null {
  return getEmailValidationError(email) ?? getWebsiteValidationError(website);
}
