import { feishuClient } from '../feishu/client.js';
import { chatSessionStore } from '../store/chat-session.js';
import { opencodeClient } from '../opencode/client.js';

export interface CleanupStats {
  scannedChats: number;
  disbandedChats: number;
  deletedSessions: number;
  skippedProtectedSessions: number;
  removedOrphanMappings: number;
}

export class LifecycleHandler {
  // 启动时清理无效群
  async cleanUpOnStart(): Promise<void> {
    console.log('[Lifecycle] 正在检查无效群聊...');
    const stats = await this.runCleanupScan();
    console.log(
      `[Lifecycle] 清理统计: scanned=${stats.scannedChats}, disbanded=${stats.disbandedChats}, deletedSession=${stats.deletedSessions}, skippedProtected=${stats.skippedProtectedSessions}, removedOrphanMappings=${stats.removedOrphanMappings}`
    );
    console.log('[Lifecycle] 清理完成');
  }

  async runCleanupScan(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      scannedChats: 0,
      disbandedChats: 0,
      deletedSessions: 0,
      skippedProtectedSessions: 0,
      removedOrphanMappings: 0,
    };

    const chats = await feishuClient.getUserChats();
    const activeChatIdSet = new Set(chats);

    if (chats.length === 0) {
      console.log('[Lifecycle] 当前未检索到任何群聊，跳过孤儿映射清理');
    } else {
      for (const mappedChatId of chatSessionStore.getAllChatIds()) {
        if (activeChatIdSet.has(mappedChatId)) continue;
        if (!chatSessionStore.isGroupChatSession(mappedChatId)) {
          continue;
        }
        chatSessionStore.removeSession(mappedChatId);
        stats.removedOrphanMappings += 1;
        console.log(`[Lifecycle] 已移除孤儿映射: chat=${mappedChatId}`);
      }
    }

    for (const chatId of chats) {
      stats.scannedChats += 1;
      await this.checkAndDisbandIfEmpty(chatId, stats);
    }

    return stats;
  }

  // 处理用户退群事件
  async handleMemberLeft(chatId: string, memberId: string): Promise<void> {
    console.log(`[Lifecycle] 用户 ${memberId} 退出群 ${chatId}`);
    await this.checkAndDisbandIfEmpty(chatId);
  }

  private async checkAndDisbandIfEmpty(chatId: string, stats?: CleanupStats): Promise<void> {
    const members = await feishuClient.getChatMembers(chatId);
    console.log(`[Lifecycle] 检查群 ${chatId} 成员数: ${members.length}`);

    const session = chatSessionStore.getSession(chatId);
    const ownerId = session?.creatorId;
    const accessCfg = chatSessionStore.getAccessConfig(chatId);
    const hasPerChatAccessControl = !!ownerId || accessCfg.allowList.length > 0;

    if (!hasPerChatAccessControl) {
      if (members.length > 0) {
        console.log(`[Lifecycle] 群 ${chatId} 无访问控制且仍有成员，跳过解散`);
        return;
      }
      console.log(`[Lifecycle] 群 ${chatId} 无访问控制且成员为 0，准备解散...`);
      await this.cleanupAndDisband(chatId, stats);
      return;
    }

    const hasAllowedUser = members.some(memberId =>
      memberId === ownerId || accessCfg.allowList.includes(memberId)
    );

    if (hasAllowedUser) {
      console.log(`[Lifecycle] 群 ${chatId} 包含 owner 或白名单用户，跳过解散检查`);
      return;
    }

    const chatInfo = await feishuClient.getChat(chatId);
    if (chatInfo && ownerId && chatInfo.ownerId === ownerId) {
      console.log(`[Lifecycle] 群 ${chatId} 群主(${chatInfo.ownerId})为 owner，跳过解散检查`);
      return;
    }

    if (members.length <= 1) {
      console.log(`[Lifecycle] 群 ${chatId} 成员不足且无白名单用户，准备解散...`);
      await this.cleanupAndDisband(chatId, stats);
    }
  }

  private async cleanupAndDisband(chatId: string, stats?: CleanupStats): Promise<void> {
    const sessionId = chatSessionStore.getSessionId(chatId);
    if (sessionId) {
      const deleteProtected = chatSessionStore.isSessionDeleteProtected(chatId);
      if (deleteProtected) {
        console.log(`[Lifecycle] 会话删除受保护，跳过删除: ${sessionId}`);
        if (stats) stats.skippedProtectedSessions += 1;
      } else {
        try {
          const deleted = await opencodeClient.deleteSession(sessionId);
          if (deleted && stats) {
            stats.deletedSessions += 1;
          }
        } catch (e) {
          console.warn(`[Lifecycle] 删除 OpenCode 会话 ${sessionId} 失败:`, e);
        }
      }
      chatSessionStore.removeSession(chatId);
    }

    const disbanded = await feishuClient.disbandChat(chatId);
    if (disbanded && stats) {
      stats.disbandedChats += 1;
    }
  }
}

export const lifecycleHandler = new LifecycleHandler();
