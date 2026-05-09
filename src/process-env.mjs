const COPILOT_BYOK_ENV_PATTERN = /^COPILOT_PROVIDER_/;
const DEFAULT_SECRET_SOURCE_ENV = new Set([
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
]);

export function sanitizeCopilotEnvironment(baseEnv, overlay = {}, stripEnvNames = []) {
  const sanitized = { ...baseEnv };
  const sourceSecrets = new Set([...DEFAULT_SECRET_SOURCE_ENV, ...stripEnvNames].filter(Boolean));

  for (const key of Object.keys(sanitized)) {
    if (COPILOT_BYOK_ENV_PATTERN.test(key) || sourceSecrets.has(key)) {
      delete sanitized[key];
    }
  }

  return { ...sanitized, ...overlay };
}
