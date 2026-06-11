import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDominantTheme } from './useDominantTheme';

describe('useDominantTheme', () => {
  it('returns deterministic fallback variables when no cover exists', () => {
    const { result } = renderHook(() => useDominantTheme(undefined));

    expect(result.current['--theme-accent']).toBe('#7bffb4');
    expect(result.current['--theme-accent-soft']).toBe('rgba(123, 255, 180, 0.18)');
    expect(result.current['--theme-surface']).toBe('rgba(10, 12, 16, 0.54)');
  });

  it('keeps fallback variables when image sampling cannot complete', async () => {
    const { result } = renderHook(() => useDominantTheme('file:///missing-cover.jpg'));

    await waitFor(() => {
      expect(result.current['--theme-accent']).toBe('#7bffb4');
    });
  });
});
