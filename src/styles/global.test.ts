import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');

describe('global responsive styles', () => {
  it('does not lock the app to a desktop-only minimum width', () => {
    expect(css).not.toMatch(/body\s*{[^}]*min-width:\s*860px/s);
  });

  it('lays out the shell as a single vertical column for the portrait player', () => {
    expect(css).toMatch(/\.app-shell\s*{[^}]*flex-direction:\s*column/s);
    expect(css).not.toMatch(/\.app-shell\s*{[^}]*grid-template-columns/s);
  });
});
