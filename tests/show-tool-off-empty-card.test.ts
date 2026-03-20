import { describe, it, expect, vi } from 'vitest';

vi.mock('dotenv/config', () => ({}));

vi.mock('../src/config.js', () => ({
  outputConfig: {
    feishu: {
      showThinkingChain: true,
      showToolChain: true,
    },
  },
}));

import { buildStreamCards, type StreamCardData, type StreamCardSegment } from '../src/feishu/cards-stream.js';

function cardBodyText(card: object): string {
  const c = card as { body?: { elements?: object[] } };
  return JSON.stringify(c.body?.elements ?? []);
}

function cardHeader(card: object): string {
  const c = card as { header?: { title?: { content?: string } } };
  return c.header?.title?.content ?? '';
}

describe('showTools=false 不产生空白卡片', () => {

  it('纯 tool segments + showTools=false → 不渲染工具，只显示光标或无输出', () => {
    const data: StreamCardData = {
      text: '',
      thinking: '',
      tools: [
        { name: 'bash', status: 'running' },
      ],
      segments: [
        { type: 'tool', name: 'bash', status: 'running' } as StreamCardSegment,
      ],
      status: 'processing',
    };

    const cards = buildStreamCards(data, undefined, { showThinking: true, showTools: false });
    const body = cardBodyText(cards[0]);
    expect(body).not.toContain('bash');
    expect(body).toContain('▋');
  });

  it('纯 tool segments + completed + showTools=false → 显示"无输出"而非空白', () => {
    const data: StreamCardData = {
      text: '',
      thinking: '',
      tools: [
        { name: 'bash', status: 'completed', output: 'done' },
      ],
      segments: [
        { type: 'tool', name: 'bash', status: 'completed', output: 'done' } as StreamCardSegment,
      ],
      status: 'completed',
    };

    const cards = buildStreamCards(data, undefined, { showThinking: true, showTools: false });
    const body = cardBodyText(cards[0]);
    expect(body).not.toContain('bash');
    expect(body).toContain('无输出');
  });

  it('tool segments + text segment + showTools=false → 只渲染 text', () => {
    const data: StreamCardData = {
      text: '任务完成',
      thinking: '',
      tools: [
        { name: 'Read', status: 'completed' },
      ],
      segments: [
        { type: 'tool', name: 'Read', status: 'completed' } as StreamCardSegment,
        { type: 'text', text: '任务完成' } as StreamCardSegment,
      ],
      status: 'completed',
    };

    const cards = buildStreamCards(data, undefined, { showThinking: true, showTools: false });
    const body = cardBodyText(cards[0]);
    expect(body).not.toContain('Read');
    expect(body).toContain('任务完成');
  });

  it('showTools=true 时 tool segments 正常显示', () => {
    const data: StreamCardData = {
      text: '',
      thinking: '',
      tools: [
        { name: 'bash', status: 'running' },
      ],
      segments: [
        { type: 'tool', name: 'bash', status: 'running' } as StreamCardSegment,
      ],
      status: 'processing',
    };

    const cards = buildStreamCards(data, undefined, { showThinking: true, showTools: true });
    const body = cardBodyText(cards[0]);
    expect(body).toContain('bash');
  });

  it('showThinking=false + 纯 reasoning segments → 不渲染思考', () => {
    const data: StreamCardData = {
      text: '',
      thinking: '深度思考中...',
      tools: [],
      segments: [
        { type: 'reasoning', text: '深度思考中...' } as StreamCardSegment,
      ],
      status: 'processing',
    };

    const cards = buildStreamCards(data, undefined, { showThinking: false, showTools: true });
    const body = cardBodyText(cards[0]);
    expect(body).not.toContain('思考过程');
    expect(body).toContain('▋');
  });

  it('both off + 只有 tool 和 thinking → 显示光标或无输出', () => {
    const data: StreamCardData = {
      text: '',
      thinking: '思考内容',
      tools: [{ name: 'grep', status: 'completed' }],
      segments: [
        { type: 'reasoning', text: '思考内容' } as StreamCardSegment,
        { type: 'tool', name: 'grep', status: 'completed' } as StreamCardSegment,
      ],
      status: 'completed',
    };

    const cards = buildStreamCards(data, undefined, { showThinking: false, showTools: false });
    const body = cardBodyText(cards[0]);
    expect(body).not.toContain('思考过程');
    expect(body).not.toContain('grep');
    expect(cardHeader(cards[0])).toContain('已完成');
  });
});
