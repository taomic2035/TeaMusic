export {};

declare global {
  interface Window {
    teaMusicBackend?: {
      scanResolvedLibrary(): Promise<string[]>;
      scanLocalLibrary(): Promise<string[]>;
      chooseLocalAudioFiles(): Promise<string[]>;
      removeLocalAudioFile?(filePath: string): Promise<string[]>;
      revealLocalAudioFile?(filePath: string): Promise<boolean>;
      readLocalArtwork?(filePath: string): Promise<string | null>;
      readLocalLyrics?(filePath: string): Promise<string | null>;
      resolveMissingTrack(query: string): Promise<{
        files: string[];
        outputDir: string;
        stdout: string;
      }>;
    };
  }
}
