import { h, render } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { TreeEntry } from './types';
import { FilePreview, FilePreviewError, FilePreviewBinary, FilePreviewCode } from './components/FilePreview';
import { MARKDOWN_EXTS, isMarkdownExt, markdownExtFilter } from '../common/extensions';
import { LS_KEYS } from '../common/localStorageKeys';

interface Props {
  id: string;
}

type Filters = { gitignore: boolean; mdOnly: boolean; hideBinary: boolean };

interface FileIndexEntry {
  name: string;
  type: string;
  path: string;
  ext: string;
  size: number;
}

function makeFilterParams(id: string, dir: string, f: Filters): string {
  const p = new URLSearchParams({ id, dir });
  if (f.gitignore) p.set('respectGitignore', '1');
  if (f.mdOnly) p.set('ext', markdownExtFilter());
  if (f.hideBinary) p.set('hideBinary', '1');
  return p.toString();
}

function isTextFile(p: string): boolean {
  const ext = p.toLowerCase().split('.').pop() || '';
  return isMarkdownExt('.' + ext) || ext === 'html' || ext === 'htm';
}

function isImageFile(p: string): boolean {
  const l = p.toLowerCase();
  return /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/.test(l);
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + pattern + '$', 'i');
}

function readFilters(): Filters {
  try {
    const saved = localStorage.getItem(LS_KEYS.FT_FILTERS);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { gitignore: true, mdOnly: false, hideBinary: true };
}

function readCurrentPath(): string {
  const ftRoot = document.getElementById('ft-preact-root');
  if (!ftRoot) return '';
  const cur = ftRoot.getAttribute('data-fullpath') || '';
  const root = ftRoot.getAttribute('data-rootdir') || '';
  return cur.replace(root, '').replace(/^[/\\]/, '');
}

function computeVisibleDirs(index: FileIndexEntry[], searchRegex: RegExp): Set<string> {
  const dirs = new Set<string>();
  dirs.add('');
  for (const e of index) {
    if (e.type !== 'file') continue;
    if (!searchRegex.test(e.name)) continue;
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }
  return dirs;
}

function dirHasVisibleFiles(dirPath: string, index: FileIndexEntry[], filters: Filters): boolean {
  const prefix = dirPath ? dirPath + '/' : '';
  return index.some(e => {
    if (e.type !== 'file') return false;
    if (prefix && !e.path.startsWith(prefix)) return false;
    if (!prefix && e.path.includes('/')) return false;
    if (filters.mdOnly && !isMarkdownExt(e.ext)) return false;
    return true;
  });
}

export function FileTree({ id }: Props) {
  const [filters, setFilters] = useState<Filters>(readFilters);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(readCurrentPath);
  const [searchQuery, setSearchQuery] = useState('');
  const [fileIndex, setFileIndex] = useState<FileIndexEntry[]>([]);
  const cacheRef = useRef<Record<string, TreeEntry[]>>({});
  const expandedRef = useRef<Record<string, boolean>>({});

  const fetchDir = useCallback(async (path: string): Promise<TreeEntry[] | null> => {
    if (cacheRef.current[path]) return cacheRef.current[path];
    try {
      const res = await fetch('/api/tree?' + makeFilterParams(id, path, filters));
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      cacheRef.current[path] = json.entries;
      return json.entries;
    } catch {
      return null;
    }
  }, [id, filters]);

  const setBothExpanded = useCallback((updater: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    setExpanded(prev => {
      const next = updater(prev);
      expandedRef.current = next;
      console.log('[FT] setBothExpanded, new state:', Object.keys(next));
      return next;
    });
  }, []);

  const fetchNeeded = useCallback(async (path: string) => {
    if (!cacheRef.current[path]) await fetchDir(path);
  }, [fetchDir]);

  const toggleDir = useCallback(async (path: string) => {
    console.log('[FT] toggleDir called:', path, 'expandedRef:', expandedRef.current[path]);
    if (expandedRef.current[path]) {
      console.log('[FT] Collapsing:', path);
      setBothExpanded(prev => { const n = { ...prev }; delete n[path]; return n; });
    } else {
      await fetchNeeded(path);
      const entries = cacheRef.current[path];
      console.log('[FT] Expanding:', path, 'entries:', entries?.length);
      if (entries && entries.length === 0) return;
      setBothExpanded(prev => ({ ...prev, [path]: true }));
    }
  }, [fetchNeeded, setBothExpanded]);

  const expandToCurrentFile = useCallback(async (doScroll: boolean) => {
    const ftRoot = document.getElementById('ft-preact-root');
    if (!ftRoot) return;
    const curPath = ftRoot.getAttribute('data-fullpath') || '';
    const rootPath = ftRoot.getAttribute('data-rootdir') || '';
    if (!rootPath || !curPath) return;
    const rel = curPath.replace(rootPath, '').replace(/^[/\\]/, '');
    const parts = rel.split(/[/\\]/);
    parts.pop();

    if (!cacheRef.current['']) await fetchDir('');
    for (let i = 0; i < parts.length; i++) {
      const dirPath = parts.slice(0, i + 1).join('/');
      if (!cacheRef.current[dirPath]) await fetchDir(dirPath);
      const entries = cacheRef.current[dirPath];
      if (entries && entries.length === 0) continue;
      setBothExpanded(prev => ({ ...prev, [dirPath]: true }));
    }

    // Apply .ft-current directly via DOM (don't rely on async useEffect timing)
    document.querySelectorAll('.ft-item.ft-current').forEach(el => el.classList.remove('ft-current'));
    if (rel) {
      const items = document.querySelectorAll('.ft-item.ft-file');
      for (let i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-path') === rel) {
          items[i].classList.add('ft-current');
          break;
        }
      }
    }

    if (doScroll) {
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = document.querySelector('.ft-item.ft-current');
            if (el) {
              const scrollContainer = el.closest('.ft-scroll');
              if (scrollContainer) {
                const elRect = el.getBoundingClientRect();
                const contRect = scrollContainer.getBoundingClientRect();
                const offset = elRect.top - contRect.top - contRect.height / 2 + elRect.height / 2;
                scrollContainer.scrollTop += offset;
                // Fallback: if scrollTop didn't move (e.g. layout not ready), use scrollIntoView
                if (scrollContainer.scrollTop === 0 && offset > 0) {
                  el.scrollIntoView({ block: 'center' });
                }
              } else {
                el.scrollIntoView({ block: 'center' });
              }
            }
            resolve();
          });
        });
      });
    }
  }, [fetchDir, setBothExpanded]);

  const handleLocate = useCallback(() => {
    expandToCurrentFile(true);
  }, [expandToCurrentFile]);

  const handleFilterChange = useCallback((key: keyof Filters) => {
    setFilters(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(LS_KEYS.FT_FILTERS, JSON.stringify(next));
      return next;
    });
    setExpanded({});
    expandedRef.current = {};
  }, []);

  // Sync currentPath from DOM attribute via MutationObserver
  useEffect(() => {
    const ftRoot = document.getElementById('ft-preact-root');
    if (!ftRoot) return;
    const obs = new MutationObserver(() => {
      setCurrentPath(readCurrentPath());
    });
    obs.observe(ftRoot, { attributes: true, attributeFilter: ['data-fullpath'] });
    return () => obs.disconnect();
  }, []);

  // Apply .ft-current highlight whenever currentPath or expanded changes
  // (fallback for renders not triggered by expandToCurrentFile)
  useEffect(() => {
    document.querySelectorAll('.ft-item.ft-current').forEach(el => el.classList.remove('ft-current'));
    if (!currentPath) return;
    const items = document.querySelectorAll('.ft-item.ft-file');
    for (let i = 0; i < items.length; i++) {
      if (items[i].getAttribute('data-path') === currentPath) {
        items[i].classList.add('ft-current');
        break;
      }
    }
  }, [currentPath, expanded]);

  // Initial load + refetch on filter change
  useEffect(() => {
    cacheRef.current = {};
    (async () => {
      await fetchDir('');
      const saved = localStorage.getItem(LS_KEYS.FT_EXPANDED);
      if (saved) {
        try {
          const paths: string[] = JSON.parse(saved);
          if (paths.length) {
            const restore: Record<string, boolean> = {};
            for (const p of paths) {
              if (!cacheRef.current[p]) await fetchDir(p);
              const entries = cacheRef.current[p];
              if (entries && entries.length === 0) continue;
              restore[p] = true;
            }
            setBothExpanded(() => restore);
          }
        } catch {}
      }
      setLoaded(false);
      requestAnimationFrame(() => {
        setLoaded(true);
        expandToCurrentFile(true);
      });
    })();
    // Fetch file index in background (for search)
    fetch('/api/file-index?id=' + encodeURIComponent(id))
      .then(r => r.json())
      .then(data => {
        if (data.entries) {
          setFileIndex(data.entries);
        }
      })
      .catch(() => {});
  }, [filters]);

  // Persist expanded state
  useEffect(() => {
    const active = Object.keys(expandedRef.current).filter(k => expandedRef.current[k]);
    if (active.length) {
      localStorage.setItem(LS_KEYS.FT_EXPANDED, JSON.stringify(active));
      } else {
        localStorage.removeItem(LS_KEYS.FT_EXPANDED);
    }
  }, [expanded]);

  // Custom event handlers
  useEffect(() => {
    // DEBUG: trace all clicks on ft-items
    const debugClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement;
      const ftRow = target.closest('.ft-row');
      const ftItem = target.closest('.ft-item');
      const ftChildren = target.closest('.ft-children');
      console.log('[FT] DEBUG click:', {
        tag: target.tagName,
        class: target.className,
        ftRow: !!ftRow,
        ftItem: !!ftItem,
        ftChildren: !!ftChildren,
        inTree: !!target.closest('.ft-root'),
        defaultPrevented: ev.defaultPrevented,
        propagationStopped: false,
      });
    };
    document.addEventListener('click', debugClick, true);

    const hRefresh = async () => {
      cacheRef.current = {};
      setExpanded({});
      expandedRef.current = {};
      setLoaded(false);
      await fetchDir('');
      setLoaded(true);
      await expandToCurrentFile(true);
      // Re-fetch file index
      fetch('/api/file-index?id=' + encodeURIComponent(id))
        .then(r => r.json())
        .then(data => { if (data.entries) setFileIndex(data.entries); })
        .catch(() => {});
    };
    const hActivate = () => { expandToCurrentFile(true); };
    window.addEventListener('onair:tree-refresh', hRefresh);
    window.addEventListener('onair:tree-activate', hActivate);
    return () => {
      document.removeEventListener('click', debugClick, true);
      window.removeEventListener('onair:tree-refresh', hRefresh);
      window.removeEventListener('onair:tree-activate', hActivate);
    };
  }, [expandToCurrentFile, fetchDir, id]);

  function openFile(filePath: string) {
    const contentEl = document.getElementById('content');
    if (!contentEl) return;
    const goBack = () => { document.getElementById('tabTree')?.click(); };
    if (isTextFile(filePath) || isImageFile(filePath)) {
      location.href = '/preview/' + id + '/' + encodeURIComponent(filePath);
    } else {
      const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath);
      fetch('/api/file?' + params).then(r => r.json()).then(data => {
        if (data.error) {
          render(h(FilePreviewError, { error: data.error, onBack: goBack }), contentEl);
          return;
        }
        if (data.isBinary) {
          render(h(FilePreviewBinary, { filePath, onBack: goBack }), contentEl);
        } else {
          render(h(FilePreviewCode, { filePath, content: data.content, onBack: goBack }), contentEl);
        }
      }).catch(() => {
        render(h(FilePreviewError, { error: 'Error loading file', onBack: goBack }), contentEl);
      });
    }
  }

  function renderDir(dirPath: string): h.JSX.Element[] {
    const entries = cacheRef.current[dirPath];
    if (!entries) return [];
    const searchRegex = searchQuery ? globToRegex(searchQuery) : null;
    const visibleDirs = searchRegex && fileIndex.length ? computeVisibleDirs(fileIndex, searchRegex) : null;
    const dirs: TreeEntry[] = [];
    const files: TreeEntry[] = [];
    for (const e of entries) {
      if (e.type === 'directory') {
        if (visibleDirs) {
          if (!visibleDirs.has(e.path)) continue;
        }
        const childEntries = cacheRef.current[e.path];
        if (childEntries && childEntries.length === 0) continue;
        dirs.push(e);
      } else {
        if (!searchRegex || searchRegex.test(e.name)) {
          files.push(e);
        }
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    const all = dirs.concat(files);
    return all.map(e => {
      if (e.type === 'directory') {
        const isExpanded = !!expandedRef.current[e.path];
        return (
          <li class={'ft-item ft-directory' + (isExpanded ? ' ft-expanded' : '')}>
            <div class="ft-row" onClick={(ev: h.JSX.TargetedMouseEvent<HTMLDivElement>) => { console.log('[FT] ft-row click:', e.path); ev.stopPropagation(); toggleDir(e.path); }}>
              <span class="ft-toggle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
              <span class="ft-name">{e.name}</span>
            </div>
            {isExpanded && (
              <ul class="ft-children">
                {renderDir(e.path)}
              </ul>
            )}
          </li>
        );
      }
      const isCurrent = e.path === currentPath;
      const href = '/preview/' + id + '/' + encodeURIComponent(e.path);
      return (
        <a class={'ft-item ft-file' + (isCurrent ? ' ft-current' : '')} data-path={e.path} href={href} onClick={(ev: h.JSX.TargetedMouseEvent<HTMLAnchorElement>) => { ev.stopPropagation(); if (!ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); openFile(e.path); } }}>
          <span class="ft-toggle ft-vis-hidden"></span>
          <span class="ft-name">{e.name}</span>
        </a>
      );
    });
  }

  return (
    <div class="ft-root">
      <div class="ft-filter">
        <label><input type="checkbox" checked={filters.gitignore} onChange={() => handleFilterChange('gitignore')} /> .gitignore</label>
        <label><input type="checkbox" checked={filters.mdOnly} onChange={() => handleFilterChange('mdOnly')} /> {MARKDOWN_EXTS.join('/')}</label>
        <label><input type="checkbox" checked={filters.hideBinary} onChange={() => handleFilterChange('hideBinary')} /> Hide unsupported</label>
        <span class="ft-filter-spacer"></span>
        <input class="ft-search" type="text" placeholder="Filter: *.svg" value={searchQuery} onInput={(e: h.JSX.TargetedEvent<HTMLInputElement>) => setSearchQuery((e.target as HTMLInputElement).value)} onKeydown={(e: h.JSX.TargetedKeyboardEvent<HTMLInputElement>) => { if (e.key === 'Escape') setSearchQuery(''); }} />
        <span class="ft-filter-actions">
          <button class="ft-locate-btn" onClick={handleLocate} title="Scroll to current file">📍</button>
          <button class="ft-x" onClick={() => window.dispatchEvent(new CustomEvent('onair:collapse-files'))} title="Hide file tree">×</button>
        </span>
      </div>
      <div class="ft-scroll">
        {!loaded ? (
          <div class="ft-loading">Loading…</div>
        ) : cacheRef.current[''] && cacheRef.current[''].length === 0 ? (
          <div class="ft-loading">No files</div>
        ) : (
          <ul class="ft-list">
            {renderDir('')}
          </ul>
        )}
      </div>
    </div>
  );
}
