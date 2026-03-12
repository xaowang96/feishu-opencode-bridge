import { feishuRetryConfig } from '../config.js';

/**
 * 判断错误是否为可重试的网络错误
 * 包括：DNS 解析失败、连接超时、网络不可达等
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // 获取错误消息
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // DNS 解析错误
  if (lowerMessage.includes('eai_again') || lowerMessage.includes('getaddrinfo')) {
    return true;
  }

  // 连接相关错误
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('etimedout') ||
    lowerMessage.includes('econnaborted') ||
    lowerMessage.includes('socket hang up') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('timeout')
  ) {
    return true;
  }

  // HTTP 5xx 错误（服务端错误）
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const statusCode = record.status || record.statusCode;
    if (typeof statusCode === 'number' && statusCode >= 500 && statusCode < 600) {
      return true;
    }
  }

  return false;
}

/**
 * 计算重试延迟（指数退避）
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // 指数退避：baseDelay * 2^(attempt-1)，加上随机抖动
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% 随机抖动
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * 延迟执行
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
}

/**
 * 带重试的异步操作包装器
 * 
 * @param operation 需要执行的异步操作
 * @param options 重试配置选项
 * @returns 操作结果和重试次数
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<RetryResult<T>> {
  const {
    maxRetries = feishuRetryConfig.maxRetries,
    baseDelayMs = feishuRetryConfig.baseDelayMs,
    maxDelayMs = feishuRetryConfig.maxDelayMs,
    shouldRetry = isRetryableError,
    onRetry,
  } = options || {};

  let lastError: unknown;
  let attempt = 0;

  while (true) {
    try {
      const result = await operation();
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      attempt++;

      // 检查是否达到最大重试次数
      if (attempt > maxRetries) {
        throw error;
      }

      // 检查错误是否可重试
      if (!shouldRetry(error)) {
        throw error;
      }

      // 计算延迟
      const delayMs = calculateDelay(attempt, baseDelayMs, maxDelayMs);

      // 调用重试回调
      if (onRetry) {
        onRetry(attempt, error, delayMs);
      }

      // 等待后重试
      await sleep(delayMs);
    }
  }
}

/**
 * 简化版重试包装器，直接返回结果
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const { result } = await withRetry(operation, options);
  return result;
}
