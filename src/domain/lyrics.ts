import { LyricLine } from './music';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

export function getActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (lyrics.length === 0) {
    return -1;
  }

  if (currentTime <= lyrics[0].at) {
    return 0;
  }

  for (let index = lyrics.length - 1; index >= 0; index -= 1) {
    if (currentTime >= lyrics[index].at) {
      return index;
    }
  }

  return 0;
}

export function getNextLyricTime(lyrics: LyricLine[], activeIndex: number, duration: number): number {
  const activeLine = lyrics[activeIndex];
  const nextLine = lyrics[activeIndex + 1];

  if (!activeLine) {
    return Number.isFinite(duration) && duration > 0 ? duration : 1;
  }

  if (nextLine && nextLine.at > activeLine.at) {
    return nextLine.at;
  }

  if (Number.isFinite(duration) && duration > activeLine.at) {
    return duration;
  }

  return activeLine.at + 1;
}

export function getLyricLineProgress(
  lyrics: LyricLine[],
  activeIndex: number,
  currentTime: number,
  duration: number,
): number {
  const activeLine = lyrics[activeIndex];

  if (!activeLine) {
    return 0;
  }

  const nextTime = getNextLyricTime(lyrics, activeIndex, duration);
  return clamp01((currentTime - activeLine.at) / Math.max(nextTime - activeLine.at, 0.001));
}

export function splitLyricCharacters(text: string): string[] {
  return Array.from(text);
}

export function getActiveCharacterCount(text: string, progress: number): number {
  return Math.round(splitLyricCharacters(text).length * clamp01(progress));
}
