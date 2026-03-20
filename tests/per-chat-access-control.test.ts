import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('dotenv/config', () => ({}));
vi.mock('fs');

let mockDefaultMode = 'blacklist';

vi.mock('../src/config.js', () => ({
  get outputConfig() {
    return {
      feishu: { showThinkingChain: true, showToolChain: true },
    };
  },
  userConfig: {
    requireMention: true,
  },
  get accessConfig() {
    return {
      defaultMode: mockDefaultMode,
      ownerOnlyManage: true,
    };
  },
  completionNotifyConfig: {
    mode: 'both' as const,
  },
}));

const mockFs = vi.mocked(fs);

beforeEach(() => {
  mockFs.existsSync.mockReturnValue(false);
  mockFs.writeFileSync.mockImplementation(() => undefined);
  mockDefaultMode = 'blacklist';
});

import { chatSessionStore } from '../src/store/chat-session.js';

const CHAT_A = 'chat_a';
const SESSION_A = 'ses_a';
const OWNER_A = 'ou_owner_a';

const CHAT_B = 'chat_b';
const SESSION_B = 'ses_b';
const OWNER_B = 'ou_owner_b';

const USER_X = 'ou_user_x';
const USER_Y = 'ou_user_y';

function setupChat(chatId: string, sessionId: string, creatorId: string): void {
  chatSessionStore.setSession(chatId, sessionId, creatorId, 'Test Chat', {
    chatType: 'group',
  });
}

describe('per-chat access control', () => {

  describe('1. default blacklist mode — everyone allowed when denyList empty', () => {
    it('allows any user when denyList is empty', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(true);
      expect(chatSessionStore.canUseBot(USER_Y, CHAT_A)).toBe(true);
      expect(chatSessionStore.canUseBot(OWNER_A, CHAT_A)).toBe(true);
    });
  });

  describe('2. blacklist mode — denied user blocked, others pass', () => {
    it('blocks denied user, allows others', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.accessDeny(CHAT_A, USER_X);

      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(false);
      expect(chatSessionStore.canUseBot(USER_Y, CHAT_A)).toBe(true);
      expect(chatSessionStore.canUseBot(OWNER_A, CHAT_A)).toBe(true);
    });
  });

  describe('3. whitelist mode — only owner + allowList pass', () => {
    it('blocks non-owner non-allowed user', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');
      chatSessionStore.accessAllow(CHAT_A, USER_X);

      expect(chatSessionStore.canUseBot(OWNER_A, CHAT_A)).toBe(true);
      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(true);
      expect(chatSessionStore.canUseBot(USER_Y, CHAT_A)).toBe(false);
    });
  });

  describe('4. accessAllow/accessDeny/accessRemove mutations', () => {
    it('accessAllow adds to allowList and removes from denyList', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.accessDeny(CHAT_A, USER_X);
      expect(chatSessionStore.getAccessConfig(CHAT_A).denyList).toContain(USER_X);

      chatSessionStore.accessAllow(CHAT_A, USER_X);
      const config = chatSessionStore.getAccessConfig(CHAT_A);
      expect(config.allowList).toContain(USER_X);
      expect(config.denyList).not.toContain(USER_X);
    });

    it('accessDeny adds to denyList and removes from allowList', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.accessAllow(CHAT_A, USER_X);
      expect(chatSessionStore.getAccessConfig(CHAT_A).allowList).toContain(USER_X);

      chatSessionStore.accessDeny(CHAT_A, USER_X);
      const config = chatSessionStore.getAccessConfig(CHAT_A);
      expect(config.denyList).toContain(USER_X);
      expect(config.allowList).not.toContain(USER_X);
    });

    it('accessRemove removes from both lists', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.accessAllow(CHAT_A, USER_X);
      chatSessionStore.accessDeny(CHAT_A, USER_Y);

      chatSessionStore.accessRemove(CHAT_A, USER_X);
      chatSessionStore.accessRemove(CHAT_A, USER_Y);

      const config = chatSessionStore.getAccessConfig(CHAT_A);
      expect(config.allowList).not.toContain(USER_X);
      expect(config.denyList).not.toContain(USER_Y);
    });

    it('accessRemove returns false when user not in any list', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      expect(chatSessionStore.accessRemove(CHAT_A, USER_X)).toBe(false);
    });

    it('accessRemove returns true when user was in a list', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.accessAllow(CHAT_A, USER_X);
      expect(chatSessionStore.accessRemove(CHAT_A, USER_X)).toBe(true);
    });
  });

  describe('5. setAccessMode switching', () => {
    it('switches mode from blacklist to whitelist', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      expect(chatSessionStore.getAccessConfig(CHAT_A).accessMode).toBe('blacklist');

      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');
      expect(chatSessionStore.getAccessConfig(CHAT_A).accessMode).toBe('whitelist');
    });

    it('affects canUseBot behavior immediately', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(true);

      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');
      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(false);
      expect(chatSessionStore.canUseBot(OWNER_A, CHAT_A)).toBe(true);
    });
  });

  describe('6. persistence — allow/deny updates are saved', () => {
    it('calls writeFileSync after accessAllow', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      mockFs.writeFileSync.mockClear();

      chatSessionStore.accessAllow(CHAT_A, USER_X);
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      const lastCall = mockFs.writeFileSync.mock.calls[mockFs.writeFileSync.mock.calls.length - 1];
      const written = JSON.parse(lastCall[1] as string);
      expect(written[CHAT_A].allowList).toContain(USER_X);
    });

    it('calls writeFileSync after accessDeny', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      mockFs.writeFileSync.mockClear();

      chatSessionStore.accessDeny(CHAT_A, USER_Y);
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      const lastCall = mockFs.writeFileSync.mock.calls[mockFs.writeFileSync.mock.calls.length - 1];
      const written = JSON.parse(lastCall[1] as string);
      expect(written[CHAT_A].denyList).toContain(USER_Y);
    });
  });

  describe('7. owner always allowed in whitelist mode', () => {
    it('owner passes even when not in allowList', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');

      expect(chatSessionStore.canUseBot(OWNER_A, CHAT_A)).toBe(true);
    });
  });

  describe('8. non-owner in whitelist mode with empty allowList → blocked', () => {
    it('blocks non-owner when allowList is empty', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');

      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(false);
    });
  });

  describe('9. per-chat isolation', () => {
    it('access control for chat A does not affect chat B', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      setupChat(CHAT_B, SESSION_B, OWNER_B);

      chatSessionStore.accessDeny(CHAT_A, USER_X);

      expect(chatSessionStore.canUseBot(USER_X, CHAT_A)).toBe(false);
      expect(chatSessionStore.canUseBot(USER_X, CHAT_B)).toBe(true);
    });

    it('different chats can have different access modes', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      setupChat(CHAT_B, SESSION_B, OWNER_B);

      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');

      expect(chatSessionStore.getAccessConfig(CHAT_A).accessMode).toBe('whitelist');
      expect(chatSessionStore.getAccessConfig(CHAT_B).accessMode).toBe('blacklist');
    });
  });

  describe('10. canUseBot for unknown chatId (no session) → default blacklist → allow', () => {
    it('allows access for unknown chatId in default blacklist mode', () => {
      expect(chatSessionStore.canUseBot(USER_X, 'chat_nonexistent')).toBe(true);
    });

    it('blocks access for unknown chatId when default mode is whitelist', () => {
      mockDefaultMode = 'whitelist';
      expect(chatSessionStore.canUseBot(USER_X, 'chat_nonexistent')).toBe(false);
    });
  });

  describe('getAccessConfig', () => {
    it('returns defaults for chat with no session', () => {
      const config = chatSessionStore.getAccessConfig('chat_nonexistent');
      expect(config.accessMode).toBe('blacklist');
      expect(config.allowList).toEqual([]);
      expect(config.denyList).toEqual([]);
      expect(config.ownerId).toBeUndefined();
    });

    it('returns correct data for configured chat', () => {
      setupChat(CHAT_A, SESSION_A, OWNER_A);
      chatSessionStore.setAccessMode(CHAT_A, 'whitelist');
      chatSessionStore.accessAllow(CHAT_A, USER_X);
      chatSessionStore.accessDeny(CHAT_A, USER_Y);

      const config = chatSessionStore.getAccessConfig(CHAT_A);
      expect(config.accessMode).toBe('whitelist');
      expect(config.allowList).toContain(USER_X);
      expect(config.denyList).toContain(USER_Y);
      expect(config.ownerId).toBe(OWNER_A);
    });
  });
});
