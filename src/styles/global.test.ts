import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');

describe('global responsive styles', () => {
  it('does not lock the app to a desktop-only minimum width', () => {
    expect(css).not.toMatch(/body\s*{[^}]*min-width:\s*860px/s);
  });

  it('defines a narrow-window layout for compact Mac windows', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*760px\)/);
  });
});
