import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const planPath = 'docs/superpowers/plans/2026-11-18-installment-pin-perf.md';
const outDir = '.superpowers/sdd/2026-11-18-installment-pin-perf';
mkdirSync(outDir, { recursive: true });

const text = readFileSync(planPath, 'utf8');
const lines = text.split(/\r?\n/);

const startIdx = lines.findIndex((l) => l.startsWith('## Global Constraints'));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('## Review Focus'));
const constraints = lines.slice(startIdx, endIdx).join('\n');

const taskStarts = [];
lines.forEach((l, i) => {
  const m = /^## Task (\d+):/.exec(l);
  if (m) taskStarts.push({ n: Number(m[1]), i });
});

const header = `# Task Brief\n\n> Extracted from ${planPath}. This brief is the single source of requirements for this task.\n\n`;

for (let k = 0; k < taskStarts.length; k += 1) {
  const { n, i } = taskStarts[k];
  const end = k + 1 < taskStarts.length ? taskStarts[k + 1].i : lines.length;
  const body = lines.slice(i, end).join('\n').replace(/\n---\s*$/, '\n');
  const content = `${header}## Global Constraints (binding for every task)\n\n${constraints.replace(/^## Global Constraints\s*/, '').trim()}\n\n---\n\n${body.trim()}\n`;
  writeFileSync(join(outDir, `task-${n}-brief.md`), content, 'utf8');
}

writeFileSync(
  join(outDir, 'plan-index.md'),
  taskStarts.map(({ n, i }) => `- Task ${n}: line ${i + 1}`).join('\n') + '\n',
  'utf8'
);

console.log(`wrote ${taskStarts.length} briefs to ${outDir}`);
