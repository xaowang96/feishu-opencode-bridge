import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

vi.mock('dotenv/config', () => ({}));
vi.mock('fs');

vi.mock('../src/config.js', () => ({
  get outputConfig() {
    return {
      feishu: { showThinkingChain: true, showToolChain: true },
    };
  },
  userConfig: {
    setOwner: vi.fn(),
    requireMention: true,
  },
  completionNotifyConfig: {
    mode: 'both' as const,
  },
}));

const mockFs = vi.mocked(fs);

beforeEach(() => {
  mockFs.existsSync.mockReturnValue(false);
  mockFs.writeFileSync.mockImplementation(() => undefined);
});

import { chatSessionStore } from '../src/store/chat-session.js';

const CHAT_ID = 'chat_group_001';
const SESSION_ID = 'ses_group_001';
const CREATOR_ID = 'ou_creator_alice';
const SENDER_B = 'ou_sender_bob';
const SENDER_C = 'ou_sender_charlie';

function setupGroupSession(): void {
  chatSessionStore.setSession(CHAT_ID, SESSION_ID, CREATOR_ID, '测试群', {
    chatType: 'group',
  });
}

describe('completion notify targets lastSenderId (not creatorId)', () => {

  describe('updateLastSender', () => {
    it('stores lastSenderId on the session', () => {
      setupGroupSession();
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      const session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId).toBe(SENDER_B);
    });

    it('overwrites previous lastSenderId', () => {
      setupGroupSession();
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_C);
      const session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId).toBe(SENDER_C);
    });

    it('ignores empty senderId', () => {
      setupGroupSession();
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      chatSessionStore.updateLastSender(CHAT_ID, '');
      const session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId).toBe(SENDER_B);
    });

    it('no-ops for unknown chatId', () => {
      expect(() => chatSessionStore.updateLastSender('chat_unknown', SENDER_B)).not.toThrow();
    });
  });

  describe('notify target resolution', () => {
    it('returns lastSenderId when set (the fix)', () => {
      setupGroupSession();
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      const session = chatSessionStore.getSession(CHAT_ID);
      const notifyTarget = session?.lastSenderId || session?.creatorId;
      expect(notifyTarget).toBe(SENDER_B);
    });

    it('falls back to creatorId when lastSenderId is not set', () => {
      setupGroupSession();
      const session = chatSessionStore.getSession(CHAT_ID);
      const notifyTarget = session?.lastSenderId || session?.creatorId;
      expect(notifyTarget).toBe(CREATOR_ID);
    });

    it('after user B sends, notify targets B (not creator A)', () => {
      setupGroupSession();
      // Simulate: creator A set up session, then user B sends a message
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      const session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.creatorId).toBe(CREATOR_ID);
      expect(session?.lastSenderId).toBe(SENDER_B);

      const notifyTarget = session?.lastSenderId || session?.creatorId;
      expect(notifyTarget).toBe(SENDER_B);
      expect(notifyTarget).not.toBe(CREATOR_ID);
    });

    it('multi-user sequence: always notifies the latest sender', () => {
      setupGroupSession();

      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      let session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId || session?.creatorId).toBe(SENDER_B);

      chatSessionStore.updateLastSender(CHAT_ID, SENDER_C);
      session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId || session?.creatorId).toBe(SENDER_C);

      chatSessionStore.updateLastSender(CHAT_ID, CREATOR_ID);
      session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId || session?.creatorId).toBe(CREATOR_ID);
    });
  });

  describe('getNotifyConfig still works', () => {
    it('returns default notify config', () => {
      setupGroupSession();
      const cfg = chatSessionStore.getNotifyConfig(CHAT_ID);
      expect(cfg.completionNotifyMode).toBe('both');
      expect(cfg.requireMention).toBe(true);
    });
  });

  describe('setSession resets lastSenderId', () => {
    it('new session binding clears lastSenderId', () => {
      setupGroupSession();
      chatSessionStore.updateLastSender(CHAT_ID, SENDER_B);
      expect(chatSessionStore.getSession(CHAT_ID)?.lastSenderId).toBe(SENDER_B);

      chatSessionStore.setSession(CHAT_ID, 'ses_new_002', CREATOR_ID, '新会话');
      const session = chatSessionStore.getSession(CHAT_ID);
      expect(session?.lastSenderId).toBeUndefined();
      const notifyTarget = session?.lastSenderId || session?.creatorId;
      expect(notifyTarget).toBe(CREATOR_ID);
    });
  });
});
