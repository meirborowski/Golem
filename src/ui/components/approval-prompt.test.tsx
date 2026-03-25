import { describe, expect, it } from 'vitest';
import { ApprovalPrompt } from './approval-prompt.js';

describe('ApprovalPrompt', () => {
  it('renders approval details for bash commands', () => {
    const element = ApprovalPrompt({
      approval: {
        toolCallId: 'call-123',
        toolName: 'bash',
        args: { command: 'npm test' },
      },
      onApprove: () => {},
      onDeny: () => {},
    });

    expect(element).toMatchSnapshot();
  });
});
