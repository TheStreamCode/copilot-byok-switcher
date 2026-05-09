const FAMILY_PRIORITIES = [
  [/minimax/i, 100],
  [/kimi|moonshot/i, 95],
  [/deepseek/i, 90],
  [/qwen/i, 80],
  [/glm|zai-org/i, 75],
  [/gpt-oss|gpt/i, 60],
  [/mistral|mixtral|codestral/i, 50],
];

const DENY_PATTERNS = [
  /(^|[/_-])(flux|sdxl|stable-diffusion|diffusion)([/_.-]|$)/i,
  /(^|[/_-])(embedding|embed|rerank|ocr|guard|tts|whisper|audio)([/_.-]|$)/i,
  /(text-embedding|bge-|e5-|clip|siglip)/i,
];

export function rankModels({ payload, requireToolSupport = false } = {}) {
  const items = getModelItems(payload);

  return items
    .map((model, index) => ({ model, index, id: getModelId(model) }))
    .filter((entry) => entry.id && isUsableModel(entry.model, entry.id, requireToolSupport))
    .map((entry) => ({
      id: entry.id,
      updated: getUpdatedTicks(entry.model),
      created: getCreatedTicks(entry.model),
      family: getFamilyPriority(entry.id),
      version: getVersionScore(entry.id),
      context: getContextLength(entry.model),
      index: entry.index,
    }))
    .sort((a, b) => (
      b.updated - a.updated ||
      b.created - a.created ||
      b.family - a.family ||
      b.version - a.version ||
      b.context - a.context ||
      a.id.localeCompare(b.id) ||
      a.index - b.index
    ))
    .map((entry) => entry.id)
    .filter((id, index, all) => all.indexOf(id) === index);
}

function getModelItems(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return [
    ...(Array.isArray(payload.data) ? payload.data : []),
    ...(Array.isArray(payload.models) ? payload.models : []),
  ];
}

function getModelId(model) {
  if (typeof model?.id === 'string' && model.id.trim()) return model.id.trim();
  if (typeof model?.name === 'string' && model.name.trim()) return model.name.trim();
  return '';
}

function isUsableModel(model, id, requireToolSupport) {
  if (DENY_PATTERNS.some((pattern) => pattern.test(id))) return false;

  if (Array.isArray(model.input_modalities) && model.input_modalities.length > 0 && !model.input_modalities.includes('text')) {
    return false;
  }

  if (model.supportsServerless === false || model.supports_serverless === false) return false;
  if (typeof model.state === 'string' && model.state && model.state !== 'READY') return false;
  if (typeof model.status?.code === 'string' && model.status.code && model.status.code !== 'OK') return false;

  let hasToolMetadata = false;
  let hasToolSupport = false;

  if (Array.isArray(model.supported_features) && model.supported_features.length > 0) {
    hasToolMetadata = true;
    hasToolSupport = model.supported_features.includes('tools');
    if (!hasToolSupport) return false;
  }

  const hasConversationConfig = Boolean(model.conversationConfig || model.conversation_config);
  if (model.supportsTools != null || model.supports_tools != null || hasConversationConfig) {
    hasToolMetadata = true;
    hasToolSupport = hasToolSupport || model.supportsTools === true || model.supports_tools === true || hasConversationConfig;
    if (!hasToolSupport) return false;
  }

  if (requireToolSupport && hasToolMetadata && !hasToolSupport) return false;

  if (typeof model.kind === 'string' && model.kind) {
    const compatibleKinds = new Set(['HF_BASE_MODEL', 'CUSTOM_MODEL', 'FIRE_AGENT', 'LIVE_MERGE']);
    if (!compatibleKinds.has(model.kind)) return false;
  }

  return true;
}

function getUpdatedTicks(model) {
  return getDateTicks(model, ['updateTime', 'updated_at', 'updatedAt']);
}

function getCreatedTicks(model) {
  const dateTicks = getDateTicks(model, ['createTime', 'created_at', 'createdAt']);
  if (dateTicks > 0) return dateTicks;

  const created = Number(model?.created);
  return Number.isFinite(created) && created > 0 ? created * 1000 : 0;
}

function getDateTicks(model, keys) {
  for (const key of keys) {
    const value = model?.[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return 0;
}

function getContextLength(model) {
  for (const key of ['context_length', 'contextLength', 'max_model_len', 'trainingContextLength']) {
    const value = Number(model?.[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return 0;
}

function getFamilyPriority(id) {
  for (const [pattern, priority] of FAMILY_PRIORITIES) {
    if (pattern.test(id)) return priority;
  }

  return 0;
}

function getVersionScore(id) {
  const matches = [...id.toLowerCase().matchAll(/(?<!\d)(\d+)(?:[.p-](\d+))?/g)];
  if (matches.length === 0) return 0;

  return Math.max(...matches.map((match) => {
    const major = Number(match[1]);
    const minor = match[2] == null ? 0 : Number(match[2]);
    return major * 1000 + minor;
  }));
}
