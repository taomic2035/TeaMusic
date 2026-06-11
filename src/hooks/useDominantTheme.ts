import { CSSProperties, useEffect, useState } from 'react';

export type ThemeVariables = CSSProperties & {
  '--theme-accent': string;
  '--theme-accent-soft': string;
  '--theme-surface': string;
  '--theme-text-strong': string;
};

const fallbackTheme: ThemeVariables = {
  '--theme-accent': '#7bffb4',
  '--theme-accent-soft': 'rgba(123, 255, 180, 0.18)',
  '--theme-surface': 'rgba(10, 12, 16, 0.54)',
  '--theme-text-strong': 'rgba(255, 255, 255, 0.94)',
};

function toThemeFromRgb(red: number, green: number, blue: number): ThemeVariables {
  return {
    '--theme-accent': `rgb(${red}, ${green}, ${blue})`,
    '--theme-accent-soft': `rgba(${red}, ${green}, ${blue}, 0.2)`,
    '--theme-surface': `rgba(${Math.max(red - 72, 8)}, ${Math.max(green - 72, 8)}, ${Math.max(blue - 72, 8)}, 0.58)`,
    '--theme-text-strong': 'rgba(255, 255, 255, 0.94)',
  };
}

export function useDominantTheme(coverUrl?: string): ThemeVariables {
  const [theme, setTheme] = useState<ThemeVariables>(fallbackTheme);

  useEffect(() => {
    if (!coverUrl || typeof Image === 'undefined' || typeof document === 'undefined') {
      setTheme(fallbackTheme);
      return;
    }

    let isMounted = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
          return;
        }

        canvas.width = 1;
        canvas.height = 1;
        context.drawImage(image, 0, 0, 1, 1);
        const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;

        if (isMounted) {
          setTheme(toThemeFromRgb(red, green, blue));
        }
      } catch {
        if (isMounted) {
          setTheme(fallbackTheme);
        }
      }
    };

    image.onerror = () => {
      if (isMounted) {
        setTheme(fallbackTheme);
      }
    };

    image.src = coverUrl;

    return () => {
      isMounted = false;
    };
  }, [coverUrl]);

  return theme;
}
