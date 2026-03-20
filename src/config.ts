import 'dotenv/config';

function normalizeBooleanToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim();
  if (!normalized) return undefined;
  // 兼容行内注释写法：SHOW_X=false # note / SHOW_X=false // note
  normalized = normalized
    .replace(/\s+#.*$/, '')
    .replace(/\s+\/\/.*$/, '')
    .trim();
  if (!normalized) return undefined;
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized ? normalized.toLowerCase() : undefined;
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = normalizeBooleanToken(value);
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

// 返回 boolean | undefined：undefined 表示"未配置"，供三层优先级覆盖链使用
export function parseOptionalBooleanEnv(value: string | undefined): boolean | undefined {
  const normalized = normalizeBooleanToken(value);
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseNonNegativeIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

// 飞书配置
export const feishuConfig = {
  appId: process.env.FEISHU_APP_ID || '',
  appSecret: process.env.FEISHU_APP_SECRET || '',
  encryptKey: process.env.FEISHU_ENCRYPT_KEY,
  verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
};

// OpenCode配置
export const opencodeConfig = {
  host: process.env.OPENCODE_HOST || 'localhost',
  port: parseInt(process.env.OPENCODE_PORT || '4096', 10),
  serverUsername: process.env.OPENCODE_SERVER_USERNAME?.trim() || 'opencode',
  serverPassword: process.env.OPENCODE_SERVER_PASSWORD?.trim() || undefined,
  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  },
};

// 用户配置
export const userConfig = {
  // 是否开启手动绑定已有 OpenCode 会话能力
  enableManualSessionBind: parseBooleanEnv(process.env.ENABLE_MANUAL_SESSION_BIND, true),

  // 群聊中是否要求 @机器人 才响应普通消息（命令和待回答问题不受此限制）
  requireMention: parseBooleanEnv(process.env.REQUIRE_MENTION, true),
};

// 访问控制配置（从环境变量读取默认值，实际控制下沉到 per-chat store）
export type AccessMode = 'blacklist' | 'whitelist';

function parseAccessMode(value: string | undefined): AccessMode {
  const normalized = normalizeBooleanToken(value);
  if (normalized === 'whitelist') return 'whitelist';
  return 'blacklist';
}

export const accessConfig = {
  defaultMode: parseAccessMode(process.env.ACCESS_MODE),
  ownerOnlyManage: parseBooleanEnv(process.env.OWNER_ONLY_MANAGE, true),
};
// 模型配置
const configuredDefaultProvider = process.env.DEFAULT_PROVIDER?.trim();
const configuredDefaultModel = process.env.DEFAULT_MODEL?.trim();
const hasConfiguredDefaultModel = Boolean(configuredDefaultProvider && configuredDefaultModel);

export const modelConfig = {
  // 不配置时交由 OpenCode 自身默认模型决策
  defaultProvider: hasConfiguredDefaultModel ? configuredDefaultProvider : undefined,
  defaultModel: hasConfiguredDefaultModel ? configuredDefaultModel : undefined,
};

// 权限配置
export const permissionConfig = {
  // 自动允许的工具列表
  toolWhitelist: (process.env.TOOL_WHITELIST || 'Read,Glob,Grep,Task').split(',').filter(Boolean),
  
  // 权限请求超时时间（毫秒）；<= 0 表示不超时，始终等待用户回复
  requestTimeout: parseNonNegativeIntEnv(process.env.PERMISSION_REQUEST_TIMEOUT_MS, 0),
};

// 输出配置
const showThinkingChain = parseBooleanEnv(process.env.SHOW_THINKING_CHAIN, true);
const showToolChain = parseBooleanEnv(process.env.SHOW_TOOL_CHAIN, true);

export const outputConfig = {
  updateInterval: parseInt(process.env.OUTPUT_UPDATE_INTERVAL || '3000', 10),
  maxMessageLength: 4000,
  showThinkingChain,
  showToolChain,
  feishu: {
    showThinkingChain,
    showToolChain,
  },
};

// 附件配置
export const attachmentConfig = {
  maxSize: parseInt(process.env.ATTACHMENT_MAX_SIZE || String(50 * 1024 * 1024), 10),
};

// 完成通知配置
export type CompletionNotifyMode = 'mention' | 'reaction' | 'both' | 'none';
const rawNotify = (process.env.COMPLETION_NOTIFY || 'both').trim().toLowerCase();
export const completionNotifyConfig = {
  mode: (['mention', 'reaction', 'both', 'none'].includes(rawNotify) ? rawNotify : 'both') as CompletionNotifyMode,
  get enableMention() { return this.mode === 'mention' || this.mode === 'both'; },
  get enableReaction() { return this.mode === 'reaction' || this.mode === 'both'; },
};

// 飞书 API 重试配置
export const feishuRetryConfig = {
  // 最大重试次数
  maxRetries: parseNonNegativeIntEnv(process.env.FEISHU_MAX_RETRIES, 3),
  // 初始退避时间（毫秒）
  baseDelayMs: parseNonNegativeIntEnv(process.env.FEISHU_RETRY_BASE_DELAY_MS, 1000),
  // 最大退避时间（毫秒）
  maxDelayMs: parseNonNegativeIntEnv(process.env.FEISHU_RETRY_MAX_DELAY_MS, 10000),
  // 是否启用重试
  enabled: parseBooleanEnv(process.env.FEISHU_RETRY_ENABLED, true),
};

// 验证配置
export function validateConfig(): void {
  const errors: string[] = [];
  
  if (!feishuConfig.appId) {
    errors.push('缺少 FEISHU_APP_ID');
  }
  if (!feishuConfig.appSecret) {
    errors.push('缺少 FEISHU_APP_SECRET');
  }
  
  if (errors.length > 0) {
    throw new Error(`配置错误:\n${errors.join('\n')}`);
  }
}
