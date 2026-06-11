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

  function importViaMenu() {
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('导入本地音乐'));
  }

  function openSearch() {
    fireEvent.click(screen.getByLabelText('搜索'));
  }

  function openLibrary() {
    fireEvent.click(screen.getByLabelText('打开歌曲列表'));
    return screen.getByRole('dialog', { name: '歌曲列表' });
  }

  function getLibrary() {
    return screen.queryByRole('dialog', { name: '歌曲列表' }) ?? openLibrary();
  }

  function openVolume() {
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByLabelText('音量'));
  }

  function getMainSearchInput() {
    return document.querySelector('.search-bar input') as HTMLInputElement;
  }

  it('renders a single-screen minimal player without sidebar, toolbar or playlists', () => {
    render(<App />);

    expect(screen.getByLabelText('沉浸播放页')).toBeInTheDocument();
    expect(screen.getByLabelText('打开歌曲列表')).toBeInTheDocument();
    expect(screen.getByLabelText('当前播放')).toBeInTheDocument();
    expect(screen.getByLabelText('更多操作')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '歌曲列表' })).not.toBeInTheDocument();

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByText('发现')).not.toBeInTheDocument();
    expect(screen.queryByText('今日循环')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('播放队列面板')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('睡眠定时：关闭')).not.toBeInTheDocument();
  });

  it('marks the immersive screen while audio is playing for cover motion styling', () => {
    render(<App />);

    expect(screen.getByLabelText('沉浸播放页')).toHaveClass('is-idle');

    fireEvent.click(screen.getByLabelText('播放'));

    expect(screen.getByLabelText('沉浸播放页')).toHaveClass('is-playing');
  });

  it('shows an empty state inside the library drawer when filtering has no matches', () => {
    render(<App />);

    const library = openLibrary();
    const search = within(library).getByPlaceholderText('搜索歌曲、歌手');
    fireEvent.change(search, { target: { value: '完全不存在的歌' } });

    expect(within(library).getByText('没有匹配的歌曲')).toBeInTheDocument();
  });

  it('adds local audio to the unified library without source badges', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('添加本地音乐'), {
      target: {
        files: [new File(['audio'], '夜晚散步 - Taomic.mp3', { type: 'audio/mpeg' })],
      },
    });

    expect(screen.getAllByText('夜晚散步').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.queryByText('本地')).not.toBeInTheDocument();
  });

  it('imports dropped local audio files without source badges', () => {
    render(<App />);

    const shell = document.querySelector('.app-shell') as HTMLElement;
    fireEvent.drop(shell, {
      dataTransfer: {
        files: [new File(['audio'], '拖进来的歌 - Taomic.flac', { type: 'audio/flac' })],
      },
    });

    expect(screen.getAllByText('拖进来的歌').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.queryByText('本地')).not.toBeInTheDocument();
  });

  it('imports dropped Mac lossless audio files even when the browser omits a MIME type', () => {
    render(<App />);

    const shell = document.querySelector('.app-shell') as HTMLElement;
    fireEvent.drop(shell, {
      dataTransfer: {
        files: [new File(['audio'], '母带现场 - Taomic.aiff', { type: '' })],
      },
    });

    expect(screen.getAllByText('母带现场').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Taomic').length).toBeGreaterThan(0);
    expect(screen.queryByText('本地')).not.toBeInTheDocument();
  });

  it('imports native local paths from the Mac shell without source badges', async () => {
    const chooseLocalAudioFiles = vi.fn(async () => ['/Users/taomic/Music/TeaMusic/Local/玻璃夜航-Taomic.m4a']);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles,    };

    render(<App />);
    importViaMenu();

    await waitFor(() => {
      expect(chooseLocalAudioFiles).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getAllByText('玻璃夜航').length).toBeGreaterThan(0);
    });
    expect(within(getLibrary()).getByRole('button', { name: /玻璃夜航/ })).toHaveTextContent('Taomic');
    expect(screen.queryByText('本地')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('opens online finder directly from the library drawer', () => {
    render(<App />);

    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: '在线找歌' }));

    expect(screen.getByRole('dialog', { name: '在线找歌' })).toBeInTheDocument();
  });

  it('does not duplicate native local paths returned from the Mac shell', async () => {
    const chooseLocalAudioFiles = vi.fn(async () => ['/Users/taomic/Music/TeaMusic/Local/玻璃夜航-Taomic.m4a']);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles,    };

    render(<App />);
    importViaMenu();
    await waitFor(() => {
      expect(within(getLibrary()).getByText('玻璃夜航')).toBeInTheDocument();
    });

    importViaMenu();
    await waitFor(() => {
      expect(within(getLibrary()).getAllByText('玻璃夜航')).toHaveLength(1);
    });

    delete window.teaMusicBackend;
  });

  it('restores persisted likes when manually importing a native local path', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/手动喜欢还在-Taomic.m4a';
    window.localStorage.setItem('teaMusic:likedTrackIds', JSON.stringify([`local:path:${filePath}`]));
    const chooseLocalAudioFiles = vi.fn(async () => [filePath]);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles,    };

    render(<App />);
    importViaMenu();
    await waitFor(() => {
      expect(within(getLibrary()).getByText('手动喜欢还在')).toBeInTheDocument();
    });

    fireEvent.click(within(getLibrary()).getByRole('button', { name: /手动喜欢还在/ }));
    expect(screen.getByLabelText('取消喜欢当前歌曲')).toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('removes a restored local path from the app library without deleting the file', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/移出测试-Taomic.wav';
    const removeLocalAudioFile = vi.fn(async () => []);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      removeLocalAudioFile,    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /移出测试/ })).toBeInTheDocument();
    });

    fireEvent.click(within(getLibrary()).getByRole('button', { name: /移出测试/ }));
    Object.defineProperty(document.querySelector('audio') as HTMLAudioElement, 'pause', {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByLabelText('移出本地音乐'));

    await waitFor(() => {
      expect(removeLocalAudioFile).toHaveBeenCalledWith(filePath);
    });
    expect(within(getLibrary()).queryByRole('button', { name: /移出测试/ })).not.toBeInTheDocument();
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
      revealLocalAudioFile,    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /访达定位/ })).toBeInTheDocument();
    });

    fireEvent.click(within(getLibrary()).getByRole('button', { name: /访达定位/ }));
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByLabelText('在访达中显示'));

    await waitFor(() => {
      expect(revealLocalAudioFile).toHaveBeenCalledWith(filePath);
    });
    expect(screen.queryByText('打开网页')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });


  it('drives the whole-window backdrop from the current track cover', () => {
    render(<App />);

    const shell = document.querySelector('.app-shell') as HTMLElement;
    expect(document.querySelector('.app-backdrop')).toBeInTheDocument();
    expect(shell.style.getPropertyValue('--app-cover')).toContain('url(');
  });

  it('renders compact synced lyrics on the immersive player screen', () => {
    render(<App />);

    expect(screen.getByLabelText('歌词预览')).toBeInTheDocument();
    expect(document.querySelector('.lyric-line.active')).toBeInTheDocument();
  });

  it('opens fullscreen lyrics from the compact lyric stage', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('歌词预览'));

    expect(screen.getByRole('dialog', { name: '全屏歌词' })).toBeInTheDocument();
    expect(screen.getByLabelText('关闭全屏歌词')).toBeInTheDocument();
  });

  it('keeps volume inside the settings menu instead of a nested popover', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('更多操作'));

    const menu = screen.getByRole('menu', { name: '播放设置' });
    expect(within(menu).getByLabelText('音量大小')).toBeInTheDocument();
    expect(document.querySelector('.volume-pop')).not.toBeInTheDocument();
  });

  it('opens the hidden finder and downloads an online track into the library', async () => {
    const downloadOnline = vi.fn(async () => ({
      filePath: 'D:/Music/TeaMusic/Archive/周杰伦/晴天 - 周杰伦.mp3',
      title: '晴天',
      artist: '周杰伦',
    }));
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      searchOnline: async () => [{ id: '402856', title: '晴天', artist: '周杰伦' }],
      downloadOnline,
    };

    render(<App />);
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('在线找歌'));
    const finderInput = screen.getByPlaceholderText('歌名或歌手，回车搜索');
    fireEvent.change(finderInput, { target: { value: '晴天' } });
    fireEvent.keyDown(finderInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('晴天')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('下载'));

    await waitFor(() => {
      expect(downloadOnline).toHaveBeenCalledWith('402856');
    });
    fireEvent.click(screen.getByLabelText('关闭在线找歌'));
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /晴天/ })).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('opens verification, resumes online search and downloads the best ranked match', async () => {
    const searchOnline = vi
      .fn()
      .mockResolvedValueOnce({
        error: '需要真人检测，验证后继续搜索',
        code: 'VERIFY_REQUIRED' as const,
        verifyUrl: 'https://www.fangpi.net/s/%E6%99%B4%E5%A4%A9',
      })
      .mockResolvedValueOnce([
        { id: '100', title: '晴天娃娃', artist: '江语晨' },
        { id: '402856', title: '晴天', artist: '周杰伦' },
        { id: '101', title: '晴天', artist: '五月天' },
      ]);
    const downloadOnline = vi.fn(async () => ({
      filePath: 'D:/Music/TeaMusic/Archive/周杰伦/晴天 - 周杰伦.mp3',
      title: '晴天',
      artist: '周杰伦',
    }));
    const openVerificationPage = vi.fn(async () => true);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      searchOnline,
      downloadOnline,
      openVerificationPage,
    };

    render(<App />);
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('在线找歌'));
    const finderInput = screen.getByPlaceholderText('歌名或歌手，回车搜索');
    fireEvent.change(finderInput, { target: { value: '晴天' } });
    fireEvent.keyDown(finderInput, { key: 'Enter' });

    await waitFor(() => {
      expect(openVerificationPage).toHaveBeenCalledWith('https://www.fangpi.net/s/%E6%99%B4%E5%A4%A9');
    });
    await waitFor(() => {
      expect(searchOnline).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(downloadOnline).toHaveBeenCalledWith('402856');
    });
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /晴天/ })).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('stops automatic search download when verification does not release the source', async () => {
    const searchOnline = vi.fn(async () => ({
      error: '需要真人检测，验证后继续搜索',
      code: 'VERIFY_REQUIRED' as const,
      verifyUrl: 'https://www.fangpi.net/s/%E6%88%90%E9%83%BD%20%E8%B5%B5%E9%9B%B7',
    }));
    const downloadOnline = vi.fn(async () => ({ error: 'unused' }));
    const openVerificationPage = vi.fn(async () => true);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      searchOnline,
      downloadOnline,
      openVerificationPage,
    };

    render(<App />);
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('在线找歌'));
    const finderInput = screen.getByPlaceholderText('歌名或歌手，回车搜索');
    fireEvent.change(finderInput, { target: { value: '成都 赵雷' } });
    fireEvent.keyDown(finderInput, { key: 'Enter' });

    await waitFor(() => {
      expect(searchOnline).toHaveBeenCalledTimes(2);
    });
    expect(openVerificationPage).toHaveBeenCalledTimes(1);
    expect(downloadOnline).not.toHaveBeenCalled();
    expect(screen.getByText(/源站真人检测未放行，未下载/)).toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('opens an in-app verification window and retries a protected online download automatically', async () => {
    const downloadOnline = vi
      .fn()
      .mockResolvedValueOnce({
        error: '需要真人检测，验证后再重试下载',
        code: 'VERIFY_REQUIRED' as const,
        verifyUrl: 'https://www.fangpi.net/music/402856',
      })
      .mockResolvedValueOnce({
        filePath: 'D:/Music/TeaMusic/Archive/周杰伦/晴天 - 周杰伦.mp3',
        title: '晴天',
        artist: '周杰伦',
      });
    const openVerificationPage = vi.fn(async () => true);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      searchOnline: async () => [{ id: '402856', title: '晴天', artist: '周杰伦' }],
      downloadOnline,
      openVerificationPage,
    };

    render(<App />);
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('在线找歌'));
    const finderInput = screen.getByPlaceholderText('歌名或歌手，回车搜索');
    fireEvent.change(finderInput, { target: { value: '晴天' } });
    fireEvent.keyDown(finderInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('晴天')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('下载'));

    await waitFor(() => {
      expect(openVerificationPage).toHaveBeenCalledWith('https://www.fangpi.net/music/402856');
    });
    await waitFor(() => {
      expect(downloadOnline).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /晴天/ })).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('stops automatic download when verification does not release the source', async () => {
    const downloadOnline = vi.fn(async () => ({
      error: '需要真人检测，验证后再重试下载',
      code: 'VERIFY_REQUIRED' as const,
      verifyUrl: 'https://www.fangpi.net/music/402856',
    }));
    const openVerificationPage = vi.fn(async () => true);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      searchOnline: async () => [{ id: '402856', title: '成都', artist: '赵雷' }],
      downloadOnline,
      openVerificationPage,
    };

    render(<App />);
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('在线找歌'));
    const finderInput = screen.getByPlaceholderText('歌名或歌手，回车搜索');
    fireEvent.change(finderInput, { target: { value: '成都 赵雷' } });
    fireEvent.keyDown(finderInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('成都')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('下载'));

    await waitFor(() => {
      expect(downloadOnline).toHaveBeenCalledTimes(2);
    });
    expect(openVerificationPage).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/源站真人检测未放行，未下载/)).toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('explains that online search needs the desktop runtime when previewed in a browser', async () => {
    delete window.teaMusicBackend;

    render(<App />);
    fireEvent.click(screen.getByLabelText('更多操作'));
    fireEvent.click(screen.getByText('在线找歌'));
    const finderInput = screen.getByPlaceholderText('歌名或歌手，回车搜索');
    fireEvent.change(finderInput, { target: { value: '晴天' } });
    fireEvent.keyDown(finderInput, { key: 'Enter' });

    expect(screen.getByText('在线找歌需要在桌面端窗口使用')).toBeInTheDocument();
  });

  it('never downloads from the main library search box', async () => {
    const downloadOnline = vi.fn();
    const searchOnline = vi.fn(async () => []);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [],
      chooseLocalAudioFiles: async () => [],
      searchOnline,
      downloadOnline,
    };

    render(<App />);
    openSearch();
    const search = getMainSearchInput();
    fireEvent.change(search, { target: { value: '不存在的歌' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    await new Promise((resolve) => {
      window.setTimeout(resolve, 300);
    });

    expect(downloadOnline).not.toHaveBeenCalled();
    expect(searchOnline).not.toHaveBeenCalled();

    delete window.teaMusicBackend;
  });

  it('plays a library track immediately on double click and marks it as playing', () => {
    render(<App />);

    const row = within(getLibrary()).getByRole('button', { name: /晴夜漫游/ });
    fireEvent.doubleClick(row);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '晴夜漫游' })).toBeInTheDocument();
    expect(screen.getByLabelText('暂停')).toBeInTheDocument();
    openLibrary();
    expect(document.querySelector('.playing-bars')).toBeInTheDocument();
  });

  it('moves through the queue with transport controls', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();

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
      chooseLocalAudioFiles: async () => [],    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByText('连续一')).toBeInTheDocument();
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

    openSearch();
    const search = getMainSearchInput();
    search.focus();
    fireEvent.keyDown(search, { key: ' ', code: 'Space' });
    fireEvent.keyDown(search, { key: 'ArrowRight' });

    expect(screen.getByLabelText('播放')).toBeInTheDocument();
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '感谢你爱我' })).toBeInTheDocument();
  });

  it('filters the unified list from the search box and closes it', () => {
    render(<App />);

    openSearch();
    const search = getMainSearchInput();
    fireEvent.change(search, { target: { value: '感谢' } });
    expect(within(getLibrary()).getByRole('button', { name: /感谢你爱我/ })).toBeInTheDocument();
    expect(within(getLibrary()).queryByRole('button', { name: /晴夜漫游/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('关闭搜索'));
    expect(document.querySelector('.search-bar')).not.toBeInTheDocument();
    expect(within(getLibrary()).getByRole('button', { name: /晴夜漫游/ })).toBeInTheDocument();
  });

  it('opens search with the desktop shortcut and clears it with Escape', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    const search = getMainSearchInput();

    fireEvent.change(search, { target: { value: '感谢' } });
    expect(search.value).toBe('感谢');

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(document.querySelector('.search-bar')).not.toBeInTheDocument();
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

  it('likes the current track and reflects the liked state', () => {
    render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('喜欢当前歌曲'));
    expect(screen.getByLabelText('取消喜欢当前歌曲')).toBeInTheDocument();
  });

  it('persists liked tracks across app restarts', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    fireEvent.click(screen.getByLabelText('喜欢当前歌曲'));
    firstSession.unmount();

    render(<App />);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();
    expect(screen.getByLabelText('取消喜欢当前歌曲')).toBeInTheDocument();
  });

  it('persists native track play signals across app restarts', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/历史还在-Taomic.wav';
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],    };

    const firstSession = render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByText('历史还在')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /历史还在/ }));
    firstSession.unmount();

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByText('历史还在')).toBeInTheDocument();
    });

    delete window.teaMusicBackend;
  });

  it('restores the last playing track and volume on restart', () => {
    const firstSession = render(<App />);

    fireEvent.click(screen.getByLabelText('下一首'));
    openVolume();
    fireEvent.change(screen.getByLabelText('音量大小'), { target: { value: '35' } });
    firstSession.unmount();

    render(<App />);

    expect(within(screen.getByLabelText('当前播放')).getByRole('heading', { name: '当发现互相都在躲' })).toBeInTheDocument();
    openVolume();
    expect((screen.getByLabelText('音量大小') as HTMLInputElement).value).toBe('35');
  });

  it('applies restored volume to the audio element on launch', async () => {
    window.localStorage.setItem('teaMusic:volume', '35');

    render(<App />);

    await waitFor(() => {
      expect((document.querySelector('audio') as HTMLAudioElement).volume).toBe(0.35);
    });
  });

  it('exposes a vertical volume slider for listening control', () => {
    render(<App />);

    openVolume();
    const volume = screen.getByLabelText('音量大小') as HTMLInputElement;
    expect(volume.value).toBe('70');

    fireEvent.change(volume, { target: { value: '35' } });
    expect(volume.value).toBe('35');
  });

  it('adjusts the volume with arrow up and down keys', () => {
    render(<App />);

    openVolume();
    const volume = () => screen.getByLabelText('音量大小') as HTMLInputElement;

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
      chooseLocalAudioFiles: async () => [],    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByText('坏文件')).toBeInTheDocument();
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

  it('seeks playback position from the progress slider', () => {
    render(<App />);

    const progress = screen.getByLabelText('播放进度') as HTMLInputElement;
    expect(progress.value).toBe('76');

    fireEvent.change(progress, { target: { value: '12' } });

    expect(screen.getByText('0:12')).toBeInTheDocument();
    expect((screen.getByLabelText('播放进度') as HTMLInputElement).value).toBe('12');
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
    window.teaMusicBackend = {      chooseLocalAudioFiles: async () => [],
      scanResolvedLibrary: async () => ['/Users/taomic/Music/TeaMusic/Resolved/歌手/启动恢复-歌手.mp3'],
      scanLocalLibrary: async () => [],
    };

    render(<App />);

    await waitFor(() => {
      expect(within(getLibrary()).getByText('启动恢复')).toBeInTheDocument();
    });
    expect(screen.queryByText('已补全')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('restores native local tracks from the Mac library on launch', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/重启还在-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],    };

    render(<App />);

    await waitFor(() => {
      expect(within(getLibrary()).getByText('重启还在')).toBeInTheDocument();
    });
    const restoredRow = within(getLibrary()).getByRole('button', { name: /重启还在/ });
    expect(restoredRow).toHaveTextContent('Taomic');
    expect(restoredRow).not.toHaveTextContent('本地');

    delete window.teaMusicBackend;
  });

  it('loads sidecar cover artwork for restored local music', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/带封面-Taomic.wav';
    const readLocalArtwork = vi.fn(async () => 'file:///Users/taomic/Music/TeaMusic/Local/带封面-Taomic.jpg');
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      readLocalArtwork,    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /带封面/ })).toBeInTheDocument();
    });
    fireEvent.click(within(getLibrary()).getByRole('button', { name: /带封面/ }));

    await waitFor(() => {
      expect(readLocalArtwork).toHaveBeenCalledWith(filePath);
    });
    await waitFor(() => {
      const shell = document.querySelector('.app-shell') as HTMLElement;
      expect(shell.style.getPropertyValue('--app-cover')).toContain('TeaMusic/Local');
    });

    delete window.teaMusicBackend;
  });

  it('loads sidecar lyrics for restored local music', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/玻璃夜航-Taomic.wav';
    const readLocalLyrics = vi.fn(async () => '[00:01.00]把歌词放回播放器\n[00:05.00]让光从歌词上划过');
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],
      readLocalLyrics,
    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /玻璃夜航/ })).toBeInTheDocument();
    });

    fireEvent.click(within(getLibrary()).getByRole('button', { name: /玻璃夜航/ }));

    await waitFor(() => {
      expect(readLocalLyrics).toHaveBeenCalledWith(filePath);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('歌词预览')).toHaveTextContent('把歌词放回播放器');
    });

    delete window.teaMusicBackend;
  });

  it('still restores local music when resolved library scanning fails on launch', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => {
        throw new Error('resolved scan failed');
      },
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/扫描兜底-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],    };

    render(<App />);

    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /扫描兜底/ })).toBeInTheDocument();
    });
    expect(screen.queryByText('本地')).not.toBeInTheDocument();

    delete window.teaMusicBackend;
  });

  it('shows and searches parent folder albums for restored local tracks', async () => {
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => ['/Users/taomic/Music/TeaMusic/Local/深夜收藏/重启还在-Taomic.wav'],
      chooseLocalAudioFiles: async () => [],    };

    render(<App />);
    await waitFor(() => {
      expect(within(getLibrary()).getByText('重启还在')).toBeInTheDocument();
    });
    openSearch();
    fireEvent.change(getMainSearchInput(), { target: { value: '深夜收藏' } });

    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /重启还在/ })).toHaveTextContent('Taomic · 深夜收藏');
    });

    delete window.teaMusicBackend;
  });

  it('restores the last playing native local path after backend scan', async () => {
    const filePath = '/Users/taomic/Music/TeaMusic/Local/重启还在-Taomic.wav';
    window.localStorage.setItem('teaMusic:currentTrackId', `local:path:${filePath}`);
    window.teaMusicBackend = {
      scanResolvedLibrary: async () => [],
      scanLocalLibrary: async () => [filePath],
      chooseLocalAudioFiles: async () => [],    };

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
      chooseLocalAudioFiles: async () => [],    };

    render(<App />);

    await waitFor(() => {
      expect(within(getLibrary()).getByRole('button', { name: /重启还在/ })).toBeInTheDocument();
    });
    fireEvent.click(within(getLibrary()).getByRole('button', { name: /重启还在/ }));
    expect(screen.getByLabelText('取消喜欢当前歌曲')).toBeInTheDocument();

    delete window.teaMusicBackend;
  });
});
