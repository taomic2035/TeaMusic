import { describe, expect, it } from 'vitest';
import {
  getActiveCharacterCount,
  getActiveLyricIndex,
  getLyricLineProgress,
  getNextLyricTime,
  splitLyricCharacters,
} from './lyrics';
import { LyricLine } from './music';

const lyrics: LyricLine[] = [
  { at: 0, text: '把今天调成慢速播放' },
  { at: 12, text: '让玻璃里的光轻轻晃' },
  { at: 25, text: '感谢你爱我' },
];

describe('lyric timing helpers', () => {
  it('finds the active lyric line at time boundaries', () => {
    expect(getActiveLyricIndex(lyrics, -1)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 0)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 11.99)).toBe(0);
    expect(getActiveLyricIndex(lyrics, 12)).toBe(1);
    expect(getActiveLyricIndex(lyrics, 99)).toBe(2);
  });

  it('uses the next lyric time or duration as the line end', () => {
    expect(getNextLyricTime(lyrics, 0, 181)).toBe(12);
    expect(getNextLyricTime(lyrics, 2, 181)).toBe(181);
    expect(getNextLyricTime(lyrics, 2, 20)).toBe(26);
  });

  it('normalizes line progress between zero and one', () => {
    expect(getLyricLineProgress(lyrics, 1, 10, 181)).toBe(0);
    expect(getLyricLineProgress(lyrics, 1, 18.5, 181)).toBeCloseTo(0.5);
    expect(getLyricLineProgress(lyrics, 1, 90, 181)).toBe(1);
  });

  it('splits Chinese lyrics by visible character', () => {
    expect(splitLyricCharacters('让玻璃里的光')).toEqual(['让', '玻', '璃', '里', '的', '光']);
  });

  it('maps line progress to active character count', () => {
    expect(getActiveCharacterCount('感谢你爱我', 0)).toBe(0);
    expect(getActiveCharacterCount('感谢你爱我', 0.5)).toBe(3);
    expect(getActiveCharacterCount('感谢你爱我', 1)).toBe(5);
  });
});
