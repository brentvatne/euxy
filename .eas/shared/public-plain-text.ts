const UNSAFE_PUBLIC_PATTERNS = [
  /\b(?:fuck|shit|asshole|bitch|bastard|dumbass|idiot(?:ic)?|moron(?:ic)?)\b/i,
  /\b(?:kill|hurt|attack)\s+(?:you|them|him|her|yourself)\b/i,
  /\b(?:ignore|disregard|override)\b.{0,60}\b(?:previous|prior|system|developer|instruction|prompt|rule)\b/i,
  /\b(?:system|developer)\s+(?:prompt|message|instruction)\b/i,
  /\b(?:tool|shell|terminal)\s+(?:call|command)\b/i,
  /\b(?:secret|access token|password|credential)\b/i,
] as const;

const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:EXPO|GH|GITHUB|OPENAI|ANTHROPIC|API|ACCESS|AUTH|SECRET|PRIVATE)[A-Z0-9_]{0,48}\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{16,}/i,
] as const;

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / value.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function containsSecretLikeValue(text: string): boolean {
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const candidates = text.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? [];
  return candidates.some((candidate) => {
    if (/^[a-f0-9]{32,}$/i.test(candidate)) return true;
    const characterClasses = [
      /[a-z]/.test(candidate),
      /[A-Z]/.test(candidate),
      /\d/.test(candidate),
      /[+/_=-]/.test(candidate),
    ].filter(Boolean).length;
    return characterClasses >= 3 && shannonEntropy(candidate) >= 4;
  });
}

function containsPrivateValue(text: string, privateValues: string[]): boolean {
  const lower = text.toLocaleLowerCase();
  return privateValues.some((privateValue) => {
    const candidate = privateValue
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return (
      candidate.length >= 4 &&
      lower.includes(candidate.toLocaleLowerCase())
    );
  });
}

export function parsePublicPlainText(
  value: unknown,
  label: string,
  limits: { min: number; max: number },
  privateValues: string[] = []
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < limits.min) throw new Error(`${label} is too short`);
  if (text.length > limits.max) throw new Error(`${label} is too long`);
  if (/https?:\/\/|www\./i.test(text)) {
    throw new Error(`${label} must not contain a URL`);
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
    throw new Error(`${label} must not contain an email address`);
  }
  if (text.includes("@")) throw new Error(`${label} must not contain a mention`);
  if (/```|`|\[[^\]]*\]\(|^#{1,6}\s/m.test(text)) {
    throw new Error(`${label} must not contain Markdown`);
  }
  if (UNSAFE_PUBLIC_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(`${label} contains unsafe or instruction-like language`);
  }
  if (containsSecretLikeValue(text)) {
    throw new Error(`${label} contains a secret-like value`);
  }
  if (containsPrivateValue(text, privateValues)) {
    throw new Error(`${label} contains private feedback data`);
  }
  return text;
}
