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
  // Catalog since 1.0.0: the router uses these keys in its own process, so they
  // must never reach the Copilot child process.
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'DASHSCOPE_API_KEY',
  'DASHSCOPE_API_KEY_CN',
  'QWEN_API_KEY',
  'ZHIPU_API_KEY',
  'ZHIPU_CN_API_KEY',
  'STEPFUN_API_KEY',
  'ARK_API_KEY',
  'VOLCENGINE_API_KEY',
  'HUNYUAN_API_KEY',
  'QIANFAN_API_KEY',
  'BAIDU_API_KEY',
  'SILICONFLOW_API_KEY',
  'MODELSCOPE_API_KEY',
  'CEREBRAS_API_KEY',
  'TOGETHER_API_KEY',
  'DEEPINFRA_API_KEY',
  'OPENCODE_ZEN_API_KEY',
]);

// Every provider also accepts COPILOT_BYOK_<NAME>_API_KEY: the pattern covers the
// whole family instead of listing each variant.
const BYOK_SECRET_PREFIX = /^COPILOT_BYOK_.*_API_KEY$/i;

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
      BYOK_SECRET_PREFIX.test(key) ||
      STALE_COPILOT_ENV.has(normalizedKey) ||
      sourceSecrets.has(normalizedKey)
    ) {
      delete sanitized[key];
    }
  }

  return { ...sanitized, ...overlay };
}
