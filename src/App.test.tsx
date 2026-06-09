import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
    delete (window as unknown as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata;
    window.localStorage.clear();
  });

  it('renders pure music navigation only', () => {
    render(<App />);

    expect(document.querySelector('.window-controls')).toBeInTheDocument();
    expect(screen.getByText('发现')).toBeInTheDocument();
    expect(screen.getByText('曲库')).toBeInTheDocument();
    expect(screen.getByText('本地音乐')).toBeInTheDocument();
    expect(screen.getByText('我喜欢')).toBeInTheDocument();

    expect(screen.queryByText('社区')).not.toBeInTheDocument();
    expect(screen.queryByText('评论')).not.toBeInTheDocument();
    expect(screen.queryByText('关注')).not.toBeInTheDocument();
    expect(screen.queryByText('动态')).not.toBeInTheDocument();
    expect(screen.queryByText('会员')).not.toBeInTheDocument();
    expect(screen.queryByText('充值')).not.toBeInTheDocument();
    expect(screen.queryByText('商城')).not.toBeInTheDocument();
    expect(screen.queryByText('下载中心')).not.toBeInTheDocument();
    expect(screen.queryByText('发布视频')).not.toBeInTheDocument();
  });

  it('adds local audio to the unified library with a special badge', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('添加本地音乐'), {
      target: {
        files: [new File(['audio'], '夜晚散步 - Taomic.mp3', { type: 'audio/mpeg' })],
      },
    });

    expect(screen.getAllByText('夜晚散步').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本地').length).toBeGreaterThan(0);
    expect(screen.getByText('4 首 · 混合在线、已补全与本地收藏')).toBeInTheDocument();
  });

  it('imports dropped local audio files with local badges', () => {
    render(<App />);

    const shell = screen.getByText('汽水音乐').closest('.app-shell') as HTMLElement;
    fireEvent.drop(shell, {
      dataTransfer: {
        files: [new File(['audio'], '拖进来的歌 - Taomic.flac', { type: 'audio/flac' })],
      },
    });

    expect(screen.getAllByText('拖进来的歌').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本地').length).toBeGreaterThan(0);
  });

  it('imports dropped Mac lossless audio files even when the browser omits a MIME type', () => {
    render(<App />);

    const shell = screen.getByText('汽水音乐').closest('.app-shell') as HTMLElement;
    fireEvent.drop(shell, {
      dataTransfer: {
        files: [new File(['audio'], '母带现场 - Taomic.aiff', { type: '' })],
      },
    });

    expect(screen.getAllByText('母带现场').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本地').length).toBeGreaterThan(0);
  });

  it('imports native local paths from the Mac shell with local badges', async () => {
    const chooseLocalAudioFiles = vi.fn(async () => ['/Users/taomic/Music/TeaMusic/Local/玻璃夜航-Taomic.m4a']);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '添加本地音乐' }));

    await waitFor(() => {
      expect(chooseLocalAudioFiles).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText('玻璃夜航').length).toBeGreaterThan(0);
    });
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /玻璃夜航/ })).toHaveTextContent('Taomic');
    expect(screen.getAllByText('本地').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('does not duplicate native local paths returned from the Mac shell', async () => {
    const chooseLocalAudioFiles = vi.fn(async () => ['/Users/taomic/Music/TeaMusic/Local/玻璃夜航-Taomic.m4a']);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '添加本地音乐' }));
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('玻璃夜航')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加本地音乐' }));
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getAllByText('玻璃夜航')).toHaveLength(1);
    });
    expect(screen.getByText('4 首 · 混合在线、已补全与本地收藏')).toBeInTheDocument();
    expect(screen.queryByText('5 首 · 混合在线、已补全与本地收藏')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('restores persisted likes when manually importing a native local path', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/手动喜欢还在-Taomic.m4a';
    window.localStorage.setItem('teaMusic:likedTrackIds', JSON.stringify([`local:path:${filePath}`]));
    const chooseLocalAudioFiles = vi.fn(async () => [filePath]);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '添加本地音乐' }));
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('手动喜欢还在')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '我喜欢' }));
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /手动喜欢还在/ })).toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('removes a restored local path from the app library without deleting the file', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/移出测试-Taomic.wav';
    const removeLocalAudioFile = vi.fn(async () => []);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      removeLocalAudioFile,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '本地音乐' }));
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /移出测试/ })).toBeInTheDocument();
    });

    fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /移出测试/ }));
    Object.defineProperty(document.querySelector('audio') as HTMLAudioElement, 'pause', {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.click(screen.getByLabelText('移出本地音乐'));

    await waitFor(() => {
      expect(removeLocalAudioFile).toHaveBeenCalledWith(filePath);
    });
    expect(within(screen.getByLabelText('歌曲列表')).queryByRole('button', { name: /移出测试/ })).not.toBeInTheDocument();
    expect(screen.queryByText('删除文件')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('reveals a restored local path in Finder from the focused player', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/访达定位-Taomic.wav';
    const revealLocalAudioFile = vi.fn(async () => true);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      revealLocalAudioFile,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '本地音乐' }));
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /访达定位/ })).toBeInTheDocument();
    });

    fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /访达定位/ }));
    fireEvent.click(screen.getByLabelText('在访达中显示'));

    await waitFor(() => {
      expect(revealLocalAudioFile).toHaveBeenCalledWith(filePath);
    });
    expect(screen.queryByText('打开网页')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });


  it('renders the focused listening area with lyrics', () => {
    render(<App />);

    expect(screen.getByLabelText('当前播放')).toBeInTheDocument();
    expect(screen.getByLabelText('歌词')).toBeInTheDocument();
    expect(screen.getByText('让玻璃里的光轻轻晃')).toBeInTheDocument();
  });

  it('opens and closes the immersive now playing page', () => {
    render(<App />);

    expect(screen.queryByLabelText('播放页')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('打开播放页'));
    const nowPlaying = screen.getByLabelText('播放页');
    expect(within(nowPlaying).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
    expect(within(nowPlaying).getByLabelText('歌词')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('收起播放页'));
    expect(screen.queryByLabelText('播放页')).not.toBeInTheDocument();
  });

  it('seeks playback by clicking a lyric line inside the now playing page', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('打开播放页'));
    const nowPlaying = screen.getByLabelText('播放页');
    const lyrics = within(nowPlaying).getByLabelText('歌词');

    fireEvent.click(within(lyrics).getByText('让玻璃里的光轻轻晃'));

    expect(within(lyrics).getByText('让玻璃里的光轻轻晃')).toHaveClass('current');
  });

  it('closes the immersive now playing page with Escape', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('打开播放页'));
    expect(screen.getByLabelText('播放页')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText('播放页')).not.toBeInTheDocument();
  });

  it('controls playback from inside the immersive now playing page', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('打开播放页'));
    const nowPlaying = screen.getByLabelText('播放页');

    fireEvent.click(within(nowPlaying).getByLabelText('下一首'));
    expect(within(nowPlaying).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();

    fireEvent.click(within(nowPlaying).getByLabelText('播放'));
    expect(within(nowPlaying).getByLabelText('暂停')).toBeInTheDocument();
  });

  it('opens the play queue drawer and plays a track from it', () => {
    render(<App />);

    expect(screen.queryByLabelText('播放队列面板')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('播放队列'));
    const queuePanel = screen.getByLabelText('播放队列面板');
    expect(within(queuePanel).getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();

    fireEvent.click(within(queuePanel).getByRole('button', { name: /晴夜漫游/ }));
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '晴夜漫游' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('关闭播放队列'));
    expect(screen.queryByLabelText('播放队列面板')).not.toBeInTheDocument();
  });

  it('downloads the current online track on demand and marks it downloaded', async () => {
    const resolveMissingTrack = vi.fn(async () => ({
      files: ['/Users/taomic/Music/TeaMusic/Resolved/推荐曲库/晴夜漫游-推荐曲库.mp3'],
      outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
      stdout: '',
    }));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /晴夜漫游/ }));

    fireEvent.click(screen.getByLabelText('下载当前歌曲'));

    await waitFor(() => {
      expect(resolveMissingTrack).toHaveBeenCalledWith('晴夜漫游 推荐曲库');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('已下载')).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('hides the download action for local tracks that are already on disk', () => {
    render(<App />);

    expect(screen.queryByLabelText('下载当前歌曲')).not.toBeInTheDocument();
    expect(screen.getByLabelText('已下载')).toBeInTheDocument();
  });

  it('plays a library track immediately on double click and marks it as playing', () => {
    render(<App />);

    const row = within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /晴夜漫游/ });
    fireEvent.doubleClick(row);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '晴夜漫游' })).toBeInTheDocument();
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();
    expect(document.querySelector('.playing-bars')).toBeInTheDocument();
  });

  it('renders real cover artwork when a track provides coverUrl', () => {
    render(<App />);

    expect(screen.getAllByAltText('感谢你爱我 封面').length).toBeGreaterThan(0);
  });

  it('uses recommendation cards as listening shortcuts', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /场景电台/ }));

    expect(screen.getByRole('heading', { name: '本地音乐' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /当发现互相都在躲/ })).not.toBeInTheDocument();
  });

  it('opens recent listening from the hot chart recommendation when history exists', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: /热歌榜/ }));

    expect(screen.getByRole('heading', { name: '最近播放' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('moves through the queue with transport controls', () => {
    render(<App />);

    expect(screen.getByText('1 首已补全 · 2 首最近播放')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('下一首'));
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();
    expect(screen.getByText('1 首已补全 · 3 首最近播放')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('上一首'));
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
  });

  it('continues to the next queued song when audio ends', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('播放'));
    fireEvent.ended(document.querySelector('audio') as HTMLAudioElement);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();
  });

  it('starts the next native audio source after queue advance', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [
        '/Users/taomic/Music/TeaMusic/Local/连续一-Taomic.wav',
        '/Users/taomic/Music/TeaMusic/Local/连续二-Taomic.wav',
      ],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('连续一')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /连续一/ }));

    const audio = document.querySelector('audio') as HTMLAudioElement;
    const play = vi.fn(async () => undefined);
    Object.defineProperty(audio, 'play', {
      configurable: true,
      value: play,
    });

    fireEvent.click(screen.getByLabelText('播放'));
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });
    fireEvent.ended(audio);

    await waitFor(() => {
      expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '连续二' })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(2);
    });

    delete window.teaMusicBackend;
  });

  it('restarts the same song when audio ends in repeat-one mode', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('播放模式：顺序播放'));
    fireEvent.click(screen.getByLabelText('播放'));
    fireEvent.change(screen.getByLabelText('播放进度'), { target: { value: '82' } });
    fireEvent.ended(document.querySelector('audio') as HTMLAudioElement);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
    expect((screen.getByLabelText('播放进度') as HTMLInputElement).value).toBe('0');
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();
  });

  it('supports desktop keyboard playback shortcuts', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
  });

  it('supports Mac media keys for playback control', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'MediaPlayPause' });
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'MediaTrackNext' });
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'MediaTrackPrevious' });
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
  });

  it('publishes now playing metadata and controls to the system media session', () => {
    const actionHandlers = new Map<string, MediaSessionActionHandler | null>();
    const setActionHandler = vi.fn((action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      actionHandlers.set(action, handler);
    });
    class FakeMediaMetadata {
      title?: string;
      artist?: string;
      album?: string;
      artwork?: MediaImage[];

      constructor(init: MediaMetadataInit) {
        Object.assign(this, init);
      }
    }

    Object.defineProperty(navigator, 'mediaSession', {
      configurable: true,
      value: { metadata: null, setActionHandler },
    });
    Object.defineProperty(window, 'MediaMetadata', {
      configurable: true,
      value: FakeMediaMetadata,
    });

    render(<App />);

    expect(navigator.mediaSession.metadata).toMatchObject({
      album: '本地收藏',
      artist: '本地收藏',
      title: '感谢你爱我',
    });
    expect(setActionHandler).toHaveBeenCalledWith('play', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('pause', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('nexttrack', expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith('previoustrack', expect.any(Function));

    act(() => {
      actionHandlers.get('play')?.({ action: 'play' });
    });
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();

    act(() => {
      actionHandlers.get('nexttrack')?.({ action: 'nexttrack' });
    });
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();
    expect(navigator.mediaSession.metadata).toMatchObject({
      artist: 'Tizzy T',
      title: '当发现互相都在躲',
    });

    act(() => {
      actionHandlers.get('previoustrack')?.({ action: 'previoustrack' });
    });
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();

    Object.defineProperty(document.querySelector('audio') as HTMLAudioElement, 'pause', {
      configurable: true,
      value: vi.fn(),
    });
    act(() => {
      actionHandlers.get('pause')?.({ action: 'pause' });
    });
    expect(screen.getByLabelText('播放')).toBeInTheDocument();
  });

  it('does not trigger playback shortcuts while typing in search', () => {
    render(<App />);

    const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单');
    search.focus();
    fireEvent.keyDown(search, { key: ' ', code: 'Space' });
    fireEvent.keyDown(search, { key: 'ArrowRight' });

    expect(screen.getByLabelText('播放')).toBeInTheDocument();
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
  });

  it('clears the search query with the inline clear button', () => {
    render(<App />);

    const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单') as HTMLInputElement;
    expect(screen.queryByLabelText('清除搜索')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: '感谢' } });
    expect(screen.getByLabelText('清除搜索')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('清除搜索'));
    expect(search.value).toBe('');
    expect(screen.queryByLabelText('清除搜索')).not.toBeInTheDocument();
  });

  it('focuses and clears search with desktop shortcuts', () => {
    render(<App />);

    const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单') as HTMLInputElement;
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: '感谢' } });
    expect(search.value).toBe('感谢');

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search.value).toBe('');
  });

  it('imports a resolved backend result back into the library quietly', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({
        files: ['/Users/taomic/Music/TeaMusic/Resolved/歌手/真实歌名-歌手.mp3'],
        outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
        stdout: '',
      }),
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '冷门别名' } });
    fireEvent.click(screen.getByText('尝试曲库补全'));

    await waitFor(() => {
      expect(screen.getByText('曲库补全：已补全 1 首')).toBeInTheDocument();
    });
    expect(screen.getAllByText('真实歌名').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已补全').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('does not duplicate resolved backend paths already in the library', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Resolved/歌手/真实歌名-歌手.mp3';
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [filePath],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({
        files: [filePath],
        outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
        stdout: '',
      }),
    };

    render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('真实歌名')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '别名搜索' } });
    fireEvent.click(screen.getByText('尝试曲库补全'));

    await waitFor(() => {
      expect(screen.getByText('曲库补全：已补全 1 首')).toBeInTheDocument();
    });
    expect(within(screen.getByLabelText('歌曲列表')).getAllByText('真实歌名')).toHaveLength(1);

    delete window.teaMusicBackend;
  });

  it('queues background completion from search enter when the library has no match', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({
        files: ['/Users/taomic/Music/TeaMusic/Resolved/歌手/回车补全-歌手.mp3'],
        outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
        stdout: '',
      }),
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '回车补全' } });
    fireEvent.keyDown(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('曲库补全：已补全 1 首')).toBeInTheDocument();
    });
    expect(screen.getAllByText('回车补全').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('does not queue duplicate background completion jobs for the same query', async () => {
    const resolveMissingTrack = vi.fn(async () => ({
      files: [],
      outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
      stdout: '',
    }));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单');

    fireEvent.change(search, { target: { value: '重复补全' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => {
      expect(resolveMissingTrack).toHaveBeenCalledTimes(1);
    });

    fireEvent.keyDown(search, { key: 'Enter' });
    await new Promise((resolve) => {
      window.setTimeout(resolve, 300);
    });

    expect(resolveMissingTrack).toHaveBeenCalledTimes(1);

    delete window.teaMusicBackend;
  });

  it('quietly auto-queues background completion when a search has no match', async () => {
    const resolveMissingTrack = vi.fn(async () => ({
      files: ['/Users/taomic/Music/TeaMusic/Resolved/歌手/自动补全-歌手.mp3'],
      outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
      stdout: '',
    }));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '自动补全' } });

    await waitFor(() => {
      expect(resolveMissingTrack).toHaveBeenCalledWith('自动补全');
    });
    await waitFor(() => {
      expect(screen.getByText('曲库补全：已补全 1 首')).toBeInTheDocument();
    });
    expect(screen.getAllByText('自动补全').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('shows a subtle resolving row for missing searched tracks', async () => {
    let finishResolve: ((value: { files: string[]; outputDir: string; stdout: string }) => void) | undefined;
    const resolveMissingTrack = vi.fn(
      () =>
        new Promise<{ files: string[]; outputDir: string; stdout: string }>((resolve) => {
          finishResolve = resolve;
        }),
    );
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单');
    fireEvent.change(search, { target: { value: '等待补全的歌' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => {
      const list = within(screen.getByLabelText('歌曲列表'));
      expect(list.getByText('等待补全的歌')).toBeInTheDocument();
      expect(list.getByText('补全中')).toBeInTheDocument();
    });
    expect(screen.queryByText('下载中心')).not.toBeInTheDocument();

    finishResolve?.({ files: [], outputDir: '', stdout: '' });
    delete window.teaMusicBackend;
  });

  it('does not auto-queue background completion for one-character searches', async () => {
    const resolveMissingTrack = vi.fn(async () => ({
      files: [],
      outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
      stdout: '',
    }));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    const search = screen.getByPlaceholderText('搜索歌曲、歌手、歌单');
    fireEvent.change(search, { target: { value: '周' } });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 300);
    });
    expect(resolveMissingTrack).not.toHaveBeenCalled();

    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => {
      expect(resolveMissingTrack).toHaveBeenCalledWith('周');
    });

    delete window.teaMusicBackend;
  });

  it('keeps backend completion failures visible but quiet', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => {
        throw new Error('musicol failed');
      },
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '找不到的歌' } });
    fireEvent.click(screen.getByText('尝试曲库补全'));

    await waitFor(() => {
      expect(screen.getByText('曲库补全：1 首失败')).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('allows retrying the same backend completion query after a failure', async () => {
    const resolveMissingTrack = vi
      .fn()
      .mockRejectedValueOnce(new Error('musicol failed'))
      .mockResolvedValueOnce({
        files: ['/Users/taomic/Music/TeaMusic/Resolved/歌手/重试成功-歌手.mp3'],
        outputDir: '/Users/taomic/Music/TeaMusic/Resolved',
        stdout: '',
      });
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '重试补全' } });
    fireEvent.click(screen.getByText('尝试曲库补全'));

    await waitFor(() => {
      expect(screen.getByText('曲库补全：1 首失败')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('尝试曲库补全'));

    await waitFor(() => {
      expect(resolveMissingTrack).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getAllByText('重试成功').length).toBeGreaterThan(0);
    });

    delete window.teaMusicBackend;
  });

  it('switches pure music library views from the sidebar', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '本地音乐' }));
    expect(screen.getByRole('heading', { name: '本地音乐' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /当发现互相都在躲/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '我喜欢' }));
    expect(screen.getByRole('heading', { name: '我喜欢' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();
  });

  it('switches into user playlists from the sidebar', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '今日循环' }));
    expect(screen.getByRole('heading', { name: '今日循环' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /晴夜漫游/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).queryByRole('button', { name: /当发现互相都在躲/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '深夜不跳歌' }));
    expect(screen.getByRole('heading', { name: '深夜不跳歌' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('searches playlist names from the unified search box', async () => {
    const resolveMissingTrack = vi.fn(async () => ({ files: [], outputDir: '', stdout: '' }));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack,
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '深夜不跳歌' } });

    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();
    await new Promise((resolve) => {
      window.setTimeout(resolve, 300);
    });
    expect(resolveMissingTrack).not.toHaveBeenCalled();

    delete window.teaMusicBackend;
  });

  it('uses the active playlist as the playback queue', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '今日循环' }));
    fireEvent.click(screen.getByLabelText('下一首'));

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '晴夜漫游' })).toBeInTheDocument();
  });

  it('shows a recent listening queue ordered by play time', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '最近播放' }));

    expect(screen.getByRole('heading', { name: '最近播放' })).toBeInTheDocument();
    const recentRows = within(screen.getByLabelText('歌曲列表')).getAllByRole('button');
    expect(recentRows[0]).toHaveTextContent('晴夜漫游');
    expect(recentRows[1]).toHaveTextContent('当发现互相都在躲');
  });

  it('persists the playback mode across app restarts', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('播放模式：顺序播放'));
    expect(screen.getByLabelText('播放模式：单曲循环')).toBeInTheDocument();
    firstSession.unmount();

    render(<App />);
    expect(screen.getByLabelText('播放模式：单曲循环')).toBeInTheDocument();
  });

  it('keeps the current song when repeat-one mode is active', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('播放模式：顺序播放'));
    expect(screen.getByLabelText('播放模式：单曲循环')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('下一首'));
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
  });

  it('uses randomness when shuffle mode advances the queue', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    render(<App />);

    fireEvent.click(screen.getByLabelText('播放模式：顺序播放'));
    fireEvent.click(screen.getByLabelText('播放模式：单曲循环'));
    fireEvent.click(screen.getByLabelText('下一首'));

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '晴夜漫游' })).toBeInTheDocument();
    random.mockRestore();
  });

  it('cycles the sleep timer from off through focused listening presets', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('睡眠定时：关闭'));
    expect(screen.getByLabelText('睡眠定时：15 分钟')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('睡眠定时：15 分钟'));
    expect(screen.getByLabelText('睡眠定时：30 分钟')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('睡眠定时：30 分钟'));
    expect(screen.getByLabelText('睡眠定时：60 分钟')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('睡眠定时：60 分钟'));
    expect(screen.getByLabelText('睡眠定时：关闭')).toBeInTheDocument();
  });

  it('pauses playback when the sleep timer expires', () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByLabelText('播放'));
    fireEvent.click(screen.getByLabelText('睡眠定时：关闭'));
    Object.defineProperty(document.querySelector('audio') as HTMLAudioElement, 'pause', {
      configurable: true,
      value: vi.fn(),
    });

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(screen.getByLabelText('播放')).toBeInTheDocument();
    expect(screen.getByLabelText('睡眠定时：关闭')).toBeInTheDocument();
  });

  it('shows upcoming tracks from the active playback queue', () => {
    render(<App />);

    expect(within(screen.getByLabelText('即将播放')).getByText('当发现互相都在躲')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '今日循环' }));
    expect(within(screen.getByLabelText('即将播放')).getByText('晴夜漫游')).toBeInTheDocument();
  });

  it('previews the first active queue track when current track is outside that queue', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '本地音乐' }));

    expect(within(screen.getByLabelText('即将播放')).getByText('感谢你爱我')).toBeInTheDocument();
  });

  it('adds the current track into Today Loop playlist', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('加入今日循环'));
    fireEvent.click(screen.getByRole('button', { name: '今日循环' }));

    expect(screen.getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('persists user playlist edits across app restarts', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('加入今日循环'));
    firstSession.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '今日循环' }));

    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('creates a user playlist from the current track and persists it', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '新建歌单' }));

    expect(screen.getByRole('heading', { name: '我的歌单 1' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
    firstSession.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '我的歌单 1' }));

    expect(screen.getByRole('heading', { name: '我的歌单 1' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('removes the current track from a user playlist without deleting it from the library', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '新建歌单' }));
    fireEvent.click(screen.getByLabelText('从当前歌单移除'));

    expect(screen.getByText('这个播放列表还没有歌曲')).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).queryByRole('button', { name: /当发现互相都在躲/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '曲库' }));
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('adds the current track into an existing user playlist', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '新建歌单' }));
    fireEvent.click(screen.getByRole('button', { name: '曲库' }));
    fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /晴夜漫游/ }));
    fireEvent.click(screen.getByRole('button', { name: '我的歌单 1' }));
    fireEvent.click(screen.getByLabelText('加入当前歌单'));

    const playlistRows = within(screen.getByLabelText('歌曲列表'));
    expect(playlistRows.getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
    expect(playlistRows.getByRole('button', { name: /晴夜漫游/ })).toBeInTheDocument();
  });

  it('creates a similar recommendation queue from the current track', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '播放更多相似' }));

    expect(screen.getByRole('heading', { name: '相似推荐' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /晴夜漫游/ })).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).queryByRole('button', { name: /当发现互相都在躲/ })).not.toBeInTheDocument();
  });

  it('keeps skipped tracks out of similar recommendations', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '播放更多相似' }));

    expect(screen.getByRole('heading', { name: '相似推荐' })).toBeInTheDocument();
    expect(screen.getByText('还没有足够相似的歌曲')).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌曲列表')).queryByRole('button', { name: /晴夜漫游/ })).not.toBeInTheDocument();
  });

  it('keeps empty similar queues quiet instead of exposing completion actions', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByRole('button', { name: '播放更多相似' }));

    expect(screen.getByText('还没有足够相似的歌曲')).toBeInTheDocument();
    expect(screen.queryByText('尝试曲库补全')).not.toBeInTheDocument();
  });

  it('likes the current track and makes it appear in favorites', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('喜欢当前歌曲'));
    fireEvent.click(screen.getByRole('button', { name: '我喜欢' }));

    expect(screen.getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
    expect(screen.getByText('从 2 首喜欢继续延展')).toBeInTheDocument();
  });

  it('persists liked tracks across app restarts', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('喜欢当前歌曲'));
    firstSession.unmount();

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '我喜欢' }));

    expect(screen.getByRole('button', { name: /当发现互相都在躲/ })).toBeInTheDocument();
  });

  it('persists native track play signals across app restarts', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/历史还在-Taomic.wav';
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    const firstSession = render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('历史还在')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /历史还在/ }));
    expect(screen.getByText('1 首已补全 · 3 首最近播放')).toBeInTheDocument();
    firstSession.unmount();

    render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('历史还在')).toBeInTheDocument();
    });

    expect(screen.getByText('1 首已补全 · 3 首最近播放')).toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('restores the last playing track and volume on restart', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.change(screen.getByLabelText('音量'), { target: { value: '35' } });
    firstSession.unmount();

    render(<App />);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();
    expect((screen.getByLabelText('音量') as HTMLInputElement).value).toBe('35');
  });

  it('applies restored volume to the audio element on launch', async () => {
    window.localStorage.setItem('teaMusic:volume', '35');

    render(<App />);

    await waitFor(() => {
      expect((document.querySelector('audio') as HTMLAudioElement).volume).toBe(0.35);
    });
  });

  it('exposes a volume slider for listening control', () => {
    render(<App />);

    const volume = screen.getByLabelText('音量') as HTMLInputElement;
    expect(volume.value).toBe('70');

    fireEvent.change(volume, { target: { value: '35' } });
    expect(volume.value).toBe('35');
  });

  it('mutes and restores the previous volume from the volume button', () => {
    render(<App />);

    const volume = () => screen.getByLabelText('音量') as HTMLInputElement;
    expect(volume().value).toBe('70');

    fireEvent.click(screen.getByLabelText('静音'));
    expect(volume().value).toBe('0');

    fireEvent.click(screen.getByLabelText('取消静音'));
    expect(volume().value).toBe('70');
  });

  it('adjusts the volume with arrow up and down keys', () => {
    render(<App />);

    const volume = () => screen.getByLabelText('音量') as HTMLInputElement;

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(volume().value).toBe('75');

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(volume().value).toBe('65');
  });

  it('keeps playback idle when native audio play fails', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/坏文件-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('坏文件')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /坏文件/ }));
    Object.defineProperty(document.querySelector('audio') as HTMLAudioElement, 'play', {
      configurable: true,
      value: vi.fn(async () => {
        throw new Error('blocked');
      }),
    });

    fireEvent.click(screen.getByLabelText('播放'));

    await waitFor(() => {
      expect(screen.getByLabelText('播放')).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('seeks playback position and highlights lyrics by time', () => {
    render(<App />);

    const progress = screen.getByLabelText('播放进度') as HTMLInputElement;
    expect(progress.value).toBe('76');
    expect(screen.getByText('感谢你爱我，也感谢这首歌还在')).toHaveClass('current');

    fireEvent.change(progress, { target: { value: '12' } });

    expect(screen.getByText('0:12')).toBeInTheDocument();
    expect(screen.getByText('让玻璃里的光轻轻晃')).toHaveClass('current');
  });

  it('syncs real audio duration when metadata loads', () => {
    render(<App />);

    const audio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audio, 'duration', {
      configurable: true,
      value: 243,
    });

    fireEvent.loadedMetadata(audio);

    expect((screen.getByLabelText('播放进度') as HTMLInputElement).max).toBe('243');
    expect(screen.getByText('4:03')).toBeInTheDocument();
  });

  it('restores previously resolved tracks from the backend library on launch', async () => {
    window.teaMusicBackend = {
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
      chooseLocalAudioFiles: async () => [],
      scanResolvedLibrary: async () => ['/Users/taomic/Music/TeaMusic/Resolved/歌手/启动恢复-歌手.mp3'],
      scanLocalLibrary: async () => [],
    };

    render(<App />);

    expect(await screen.findByText('启动恢复')).toBeInTheDocument();
    expect(screen.getAllByText('已补全').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('restores native local tracks from the Mac library on launch', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/重启还在-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '本地音乐' }));

    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByText('重启还在')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.getAllByText('本地').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('loads sidecar LRC lyrics for restored local music', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/带歌词-Taomic.wav';
    const readLocalLyrics = vi.fn(async () => '[00:03.00]本地歌词第一句\n[00:08.50]本地歌词第二句');
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      readLocalLyrics,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /带歌词/ })).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /带歌词/ }));

    await waitFor(() => {
      expect(readLocalLyrics).toHaveBeenCalledWith(filePath);
    });
    expect(within(screen.getByLabelText('歌词')).getByText('本地歌词第一句')).toBeInTheDocument();
    expect(within(screen.getByLabelText('歌词')).getByText('本地歌词第二句')).toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('loads sidecar cover artwork for restored local music', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/带封面-Taomic.wav';
    const readLocalArtwork = vi.fn(async () => 'file:///Users/taomic/Music/TeaMusic/Local/带封面-Taomic.jpg');
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      readLocalArtwork,
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /带封面/ })).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /带封面/ }));

    await waitFor(() => {
      expect(readLocalArtwork).toHaveBeenCalledWith(filePath);
    });
    const artwork = screen.getAllByAltText('带封面 封面')[0] as HTMLImageElement;
    expect(artwork.src).toBe(encodeURI('file:///Users/taomic/Music/TeaMusic/Local/带封面-Taomic.jpg'));

    delete window.teaMusicBackend;
  });

  it('still restores local music when resolved library scanning fails on launch', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => {
        throw new Error('resolved scan failed');
      },
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/扫描兜底-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '本地音乐' }));

    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /扫描兜底/ })).toBeInTheDocument();
    });
    expect(screen.getAllByText('本地').length).toBeGreaterThan(0);

    delete window.teaMusicBackend;
  });

  it('shows and searches parent folder albums for restored local tracks', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/深夜收藏/重启还在-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.change(screen.getByPlaceholderText('搜索歌曲、歌手、歌单'), { target: { value: '深夜收藏' } });

    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /重启还在/ })).toHaveTextContent('Taomic · 深夜收藏');
    });

    delete window.teaMusicBackend;
  });

  it('restores the last playing native local path after backend scan', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/重启还在-Taomic.wav';
    window.localStorage.setItem('teaMusic:currentTrackId', `local:path:${filePath}`);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);

    await waitFor(() => {
      expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '重启还在' })).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('applies persisted likes to tracks restored by backend scan', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/重启还在-Taomic.wav';
    window.localStorage.setItem('teaMusic:likedTrackIds', JSON.stringify([`local:path:${filePath}`]));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      resolveMissingTrack: async () => ({ files: [], outputDir: '', stdout: '' }),
    };

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '我喜欢' }));

    await waitFor(() => {
      expect(within(screen.getByLabelText('歌曲列表')).getByRole('button', { name: /重启还在/ })).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });
});
