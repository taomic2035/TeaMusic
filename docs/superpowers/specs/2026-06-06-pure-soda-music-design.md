# Pure Soda Music Design

Date: 2026-06-06

## Research Basis

- Qishui official download page confirms Windows and Mac clients, with Mac downloads for Intel and M-series machines and macOS Big Sur 11.0+ copy.
- Qishui settings API currently exposes desktop release `3.2.1` with Mac `x64`, `arm64`, and `universal` packages.
- The official Mac package is an Electron app with `main.asar`, `desktopLyrics.asar`, `offline.asar`, and `taskbarWidget.asar`. Static inspection shows a dark desktop layout with a 200px sidebar, 48px topbar, bottom player, lyrics view, queue/player modules, and glass dialogs using `background:#292929d9` with `backdrop-filter: blur(32px)`.
- App Store product copy emphasizes personalized recommendation, scene radio, easy listening, Douyin collection sync, charts, and a large music library.

## Product Goal

Build a pure Mac music player inspired by Qishui Music's desktop experience. The product should feel premium, glassy, dynamic, and focused. It must only include listening and music-library functions.

The app is not a social product, not a commerce product, and not a general media platform.

## In Scope

- Music playback: play, pause, previous, next, seek, volume, play modes, current queue.
- Library: search, song detail, artist/album metadata where available, playlists, favorites.
- Recommendation: daily recommendations, scene radio, hot charts, playlist roaming, similar songs.
- Local music: add folder, drag audio files, scan metadata, play local files.
- Local/download markings: local tracks show a `本地` badge; background-filled tracks show a subtle `已补全` or `下载` badge.
- Background library completion: when a searched track is missing or unavailable, the backend may use `/Users/taomic/musicol/downloader.js` to find and download the song.
- Download status: only lightweight status appears in search results, mini toasts, and library badges. No prominent download center.
- Lyrics: synced lyrics where available, simple fallback when unavailable.
- Glass UI: translucent panels, high blur, soft borders, restrained gradients, and responsive hover/active states.

## Out Of Scope

- Comments, followers, personal profile, fan counts, feeds, messages, video sharing.
- Membership sales, upsell modals, campaigns, live content, creator onboarding, publishing.
- Heavy account center, account security flows, privacy/legal hub, feedback tickets.
- Desktop widgets and taskbar widgets for the first build.
- Complex social sync with Douyin. The UI may contain no fake sync surface.

## Information Architecture

Left navigation:

- 发现
- 曲库
- 本地音乐
- 我喜欢
- Playlists created by the user

No visible `下载`, `社区`, `会员`, `账号`, or `发布` navigation item.

Topbar:

- Search input for songs, artists, albums, and playlists.
- Tiny background resolver status such as `曲库补全：空闲` or `正在补全 2 首`.

Main views:

- Discover: recommendations, scene radios, hot charts, playlist roaming, similar music.
- Library: searchable unified library across online-like mock data, local files, and downloaded files.
- Local Music: folder import, drag import, local scan status, local-only filters.
- Player View: large cover, dynamic background, lyrics, queue, and playback controls.

## Background Library Completion

The downloader is not a product feature. It is an infrastructure fallback for missing library content.

Flow:

1. User searches in the normal search box.
2. App searches local library and known catalog records.
3. If a wanted track is missing, the resolver queues a background search using the existing downloader strategy.
4. While resolving, the result row can show `补全中`.
5. On success, the file is imported into the library, marked `已补全`, and becomes playable.
6. On failure, the row stays clean and may show a small retry affordance in a secondary menu.

The first implementation can wrap `/Users/taomic/musicol/downloader.js` as a Node child process or extract its functions into a service module. The UI should not expose the source site or make downloading feel like the main product.

## Visual System

The app uses a dark glass material system:

- Root background: layered green, blue, and violet gradients over a near-black base.
- Main panes: translucent black or deep green with `backdrop-filter: blur(28px-40px)`.
- Borders: `rgba(255,255,255,.08-.18)`.
- Cards: 8px to 16px radius depending on size, soft shadow, subtle internal highlight.
- Dialogs and menus: deep translucent glass, 32px blur, compact spacing.
- Typography: SF Pro/PingFang, strong but restrained headings, no oversized marketing type.
- Album art: real images when available; generated or gradient placeholders only for missing local metadata.

## Interaction Principles

- One search box does all discovery.
- Missing tracks are resolved quietly.
- Recommendation reacts to listening, likes, imported local music, and completed downloads.
- Local and downloaded tracks behave like first-class library items.
- Every control must feel immediate: hover, pressed, disabled, loading, and error states are included.
- Empty states invite listening actions only, such as importing music or searching the library.

## Data Model

Track:

- `id`
- `title`
- `artist`
- `album`
- `duration`
- `source`: `catalog | local | resolved`
- `filePath`
- `coverUrl`
- `lyrics`
- `liked`
- `playCount`
- `lastPlayedAt`
- `tags`
- `resolveStatus`: `none | queued | resolving | resolved | failed`

Playlist:

- `id`
- `name`
- `trackIds`
- `createdAt`
- `updatedAt`

Recommendation state:

- recently played artists and tags
- liked tracks
- local import tags
- downloaded/resolved tracks
- skipped tracks

## Testing Strategy

- Unit tests for track source labels, resolver queue state, metadata parsing, and recommendation scoring.
- Integration tests for search missing-track fallback and local import.
- UI tests for main navigation, player controls, queue, search states, local badges, and hidden downloader behavior.
- Visual verification for desktop and narrower window widths to ensure glass panels, player, and text do not overlap.

## Open Constraint

The current workspace is not a git repository. This spec cannot be committed here unless the project is initialized as git or moved into an existing repo.
