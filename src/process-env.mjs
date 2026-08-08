const COPILOT_BYOK_ENV_PATTERN = /^COPILOT_PROVIDER_/i;
const STALE_COPILOT_ENV = new Set([
  'COPILOT_MODEL',
  'COPILOT_OFFLINE',
]);
const DEFAULT_SECRET_SOURCE_ENV = new Set([
  'OPENAI_API_KEY',
  'COPILOT_OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'COPILOT_ANTHROPIC_API_KEY',
  'CHUTES_API_KEY',
  'COPILOT_CHUTES_API_KEY',
  'OPENCODE_GO_API_KEY',
  'OPENCODE_API_KEY',
  'CLAUDE_GO_API_KEY',
  'FIREWORKS_API_KEY',
  'FIREWORKS_KEY',
  'CLAUDE_FIRE_API_KEY',
  'DEEPSEEK_API_KEY',
  'COPILOT_DEEPSEEK_API_KEY',
  'ZAI_API_KEY',
  'Z_AI_API_KEY',
  'GLM_API_KEY',
  'COPILOT_ZAI_API_KEY',
  'MINIMAX_API_KEY',
  'COPILOT_MINIMAX_API_KEY',
  'OPENROUTER_API_KEY',
  'COPILOT_OPENROUTER_API_KEY',
  'MOONSHOT_API_KEY',
  'KIMI_API_KEY',
  'COPILOT_MOONSHOT_API_KEY',
  'GROQ_API_KEY',
  'COPILOT_GROQ_API_KEY',
  'XAI_API_KEY',
  'COPILOT_XAI_API_KEY',
  'MISTRAL_API_KEY',
  'COPILOT_MISTRAL_API_KEY',
  'ALIBABA_TOKEN_PLAN_API_KEY',
  'DASHSCOPE_TOKEN_PLAN_API_KEY',
  'BAILIAN_TOKEN_PLAN_API_KEY',
  'TENCENT_TOKEN_PLAN_API_KEY',
  'TOKENHUB_TOKEN_PLAN_API_KEY',
]);

export function sanitizeCopilotEnvironment(baseEnv, overlay = {}, stripEnvNames = []) {
  const sanitized = { ...baseEnv };
  const sourceSecrets = new Set(
    [...DEFAULT_SECRET_SOURCE_ENV, ...stripEnvNames]
      .filter((name) => typeof name === 'string' && name)
      .map((name) => name.toUpperCase())
  );

  for (const key of Object.keys(sanitized)) {
    const normalizedKey = key.toUpperCase();
    if (
      COPILOT_BYOK_ENV_PATTERN.test(key) ||
      STALE_COPILOT_ENV.has(normalizedKey) ||
      sourceSecrets.has(normalizedKey)
    ) {
      delete sanitized[key];
    }
  }

  return { ...sanitized, ...overlay };
}
