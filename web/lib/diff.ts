// Line-based diff for the history view (body text). Classic LCS; bodies are at most a few hundred
// lines, so O(n*m) is fine. Unchanged runs far from any change are collapsed.

export type DiffLine = { type: "same" | "add" | "del"; text: string } | { type: "gap"; count: number };

export function diffLines(oldText: string, newText: string, context = 2): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the LCS of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const raw: Array<{ type: "same" | "add" | "del"; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      raw.push({ type: "del", text: a[i++] });
    } else {
      raw.push({ type: "add", text: b[j++] });
    }
  }
  while (i < n) raw.push({ type: "del", text: a[i++] });
  while (j < m) raw.push({ type: "add", text: b[j++] });

  // Keep `context` unchanged lines around changes; collapse the rest into gaps.
  const near = raw.map(() => false);
  raw.forEach((line, k) => {
    if (line.type === "same") return;
    for (let d = -context; d <= context; d++) if (raw[k + d]) near[k + d] = true;
  });

  const out: DiffLine[] = [];
  let gap = 0;
  raw.forEach((line, k) => {
    if (line.type === "same" && !near[k]) {
      gap++;
      return;
    }
    if (gap) out.push({ type: "gap", count: gap });
    gap = 0;
    out.push(line);
  });
  if (gap) out.push({ type: "gap", count: gap });
  return out;
}
