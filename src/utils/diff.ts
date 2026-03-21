/**
 * Line-based diff engine using a simplified Myers algorithm.
 * Produces unified diff output with no external dependencies.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'remove';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

/**
 * Compute the longest common subsequence table for two arrays of lines.
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp;
}

/**
 * Backtrack through the LCS table to produce a list of diff lines.
 */
function backtrack(dp: number[][], a: string[], b: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'same', content: a[i - 1], oldLineNo: i, newLineNo: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', content: b[j - 1], newLineNo: j });
      j--;
    } else {
      result.push({ type: 'remove', content: a[i - 1], oldLineNo: i });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Compute a line-by-line diff between two arrays of strings.
 */
export function computeDiff(linesA: string[], linesB: string[]): DiffLine[] {
  const dp = lcsTable(linesA, linesB);
  return backtrack(dp, linesA, linesB);
}

/**
 * Group diff lines into hunks with the given number of context lines.
 */
export function groupIntoHunks(diffLines: DiffLine[], contextLines: number): DiffHunk[] {
  // Find indices of changed lines
  const changedIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== 'same') {
      changedIndices.push(i);
    }
  }

  if (changedIndices.length === 0) return [];

  // Group changes that are within 2*contextLines of each other
  const groups: [number, number][] = [];
  let groupStart = changedIndices[0];
  let groupEnd = changedIndices[0];

  for (let i = 1; i < changedIndices.length; i++) {
    if (changedIndices[i] - groupEnd <= contextLines * 2) {
      groupEnd = changedIndices[i];
    } else {
      groups.push([groupStart, groupEnd]);
      groupStart = changedIndices[i];
      groupEnd = changedIndices[i];
    }
  }
  groups.push([groupStart, groupEnd]);

  // Build hunks with context
  const hunks: DiffHunk[] = [];

  for (const [start, end] of groups) {
    const hunkStart = Math.max(0, start - contextLines);
    const hunkEnd = Math.min(diffLines.length - 1, end + contextLines);

    const hunkLines = diffLines.slice(hunkStart, hunkEnd + 1);

    let oldStart = 1;
    let newStart = 1;
    // Walk up to hunkStart to find line numbers
    for (let i = 0; i < hunkStart; i++) {
      if (diffLines[i].type === 'same' || diffLines[i].type === 'remove') oldStart++;
      if (diffLines[i].type === 'same' || diffLines[i].type === 'add') newStart++;
    }

    let oldCount = 0;
    let newCount = 0;
    for (const line of hunkLines) {
      if (line.type === 'same' || line.type === 'remove') oldCount++;
      if (line.type === 'same' || line.type === 'add') newCount++;
    }

    hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
  }

  return hunks;
}

/**
 * Format hunks as a unified diff string.
 */
export function formatUnifiedDiff(
  hunks: DiffHunk[],
  labelA: string,
  labelB: string,
  ignoreWhitespace: boolean,
): string {
  if (hunks.length === 0) return '';

  const output: string[] = [];
  output.push(`--- ${labelA}`);
  output.push(`+++ ${labelB}`);

  for (const hunk of hunks) {
    output.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);

    for (const line of hunk.lines) {
      const content = ignoreWhitespace ? line.content : line.content;
      switch (line.type) {
        case 'same':
          output.push(` ${content}`);
          break;
        case 'add':
          output.push(`+${content}`);
          break;
        case 'remove':
          output.push(`-${content}`);
          break;
      }
    }
  }

  return output.join('\n');
}

/**
 * Convenience: compute diff and format as unified diff in one call.
 */
export function unifiedDiff(
  textA: string,
  textB: string,
  labelA: string,
  labelB: string,
  contextLines = 3,
  ignoreWhitespace = false,
): { diff: string; linesAdded: number; linesRemoved: number; identical: boolean } {
  let linesA = textA.split('\n');
  let linesB = textB.split('\n');

  if (ignoreWhitespace) {
    const normalize = (lines: string[]) => lines.map((l) => l.trimEnd());
    linesA = normalize(linesA);
    linesB = normalize(linesB);
  }

  const diffLines = computeDiff(linesA, linesB);

  const linesAdded = diffLines.filter((l) => l.type === 'add').length;
  const linesRemoved = diffLines.filter((l) => l.type === 'remove').length;
  const identical = linesAdded === 0 && linesRemoved === 0;

  if (identical) {
    return { diff: '', linesAdded: 0, linesRemoved: 0, identical: true };
  }

  const hunks = groupIntoHunks(diffLines, contextLines);
  const diff = formatUnifiedDiff(hunks, labelA, labelB, ignoreWhitespace);

  return { diff, linesAdded, linesRemoved, identical };
}
