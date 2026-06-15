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
      searchOnline?(
        query: string,
      ): Promise<
        Array<{ id: string; title: string; artist: string; source?: string }> | { error: string; code?: 'VERIFY_REQUIRED'; verifyUrl?: string }
      >;
      downloadOnline?(
        musicId: string,
      ): Promise<
        | { filePath: string; title: string; artist: string; source?: string }
        | { error: string; code?: 'VERIFY_REQUIRED'; verifyUrl?: string }
      >;
      openVerificationPage?(url: string): Promise<boolean>;
      onVerificationNeeded?(callback: () => void): () => void;
    };
  }
}
