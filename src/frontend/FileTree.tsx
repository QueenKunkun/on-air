import { h, Fragment } from 'preact';
import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import type { TreeEntry } from './types';

interface Props {
  id: string;
}

type Filters = { gitignore: boolean; mdOnly: boolean; hideBinary: boolean };

function makeFilterParams(id: string, dir: string, f: Filters): string {
  const p = new URLSearchParams({ id, dir });
  if (f.gitignore) p.set('respectGitignore', '1');
  if (f.mdOnly) p.set('ext', '.md');
  if (f.hideBinary) p.set('hideBinary', '1');
  return p.toString();
}

function isTextFile(p: string): boolean {
  const l = p.toLowerCase();
  return l.endsWith('.md') || l.endsWith('.markdown');
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
}

function readCurrentPath(): string {
  const ftRoot = document.getElementById('ft-preact-root');
  if (!ftRoot) return '';
  const cur = ftRoot.getAttribute('data-fullpath') || '';
  const root = ftRoot.getAttribute('data-rootdir') || '';
  return cur.replace(root, '').replace(/^[/\\]/, '');
}

export function FileTree({ id }: Props) {
  const [filters, setFilters] = useState<Filters>({ gitignore: true, mdOnly: false, hideBinary: true });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(readCurrentPath);
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
      return next;
    });
  }, []);

  const fetchNeeded = useCallback(async (path: string) => {
    if (!cacheRef.current[path]) await fetchDir(path);
  }, [fetchDir]);

  const toggleDir = useCallback(async (path: string) => {
    if (expandedRef.current[path]) {
      setBothExpanded(prev => { const n = { ...prev }; delete n[path]; return n; });
    } else {
      await fetchNeeded(path);
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
                scrollContainer.scrollTop += elRect.top - contRect.top - contRect.height / 2 + elRect.height / 2;
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
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
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
      const saved = localStorage.getItem('onair-ft-expanded');
      if (saved) {
        try {
          const paths: string[] = JSON.parse(saved);
          if (paths.length) {
            const restore: Record<string, boolean> = {};
            for (const p of paths) {
              if (!cacheRef.current[p]) await fetchDir(p);
              restore[p] = true;
            }
            setBothExpanded(() => restore);
          }
        } catch {}
      }
      setLoaded(true);
      await expandToCurrentFile(false);
    })();
  }, [filters]);

  // Persist expanded state
  useEffect(() => {
    const active = Object.keys(expandedRef.current).filter(k => expandedRef.current[k]);
    if (active.length) {
      localStorage.setItem('onair-ft-expanded', JSON.stringify(active));
    } else {
      localStorage.removeItem('onair-ft-expanded');
    }
  }, [expanded]);

  // Custom event handlers
  useEffect(() => {
    const hRefresh = async () => {
      cacheRef.current = {};
      setExpanded({});
      expandedRef.current = {};
      setLoaded(false);
      await fetchDir('');
      setLoaded(true);
      await expandToCurrentFile(false);
    };
    const hActivate = () => { expandToCurrentFile(false); };
    window.addEventListener('onair:tree-refresh', hRefresh);
    window.addEventListener('onair:tree-activate', hActivate);
    return () => {
      window.removeEventListener('onair:tree-refresh', hRefresh);
      window.removeEventListener('onair:tree-activate', hActivate);
    };
  }, [expandToCurrentFile, fetchDir]);

  function openFile(filePath: string) {
    const contentEl = document.getElementById('content');
    if (!contentEl) return;
    if (isTextFile(filePath)) {
      location.href = '/preview/' + id + '/' + encodeURIComponent(filePath);
    } else {
      const params = 'id=' + encodeURIComponent(id) + '&path=' + encodeURIComponent(filePath);
      fetch('/api/file?' + params).then(r => r.json()).then(data => {
        if (data.error) {
          contentEl.innerHTML = '<div class="file-view"><div class="file-view-header">Error: ' + escapeHtml(data.error) + '</div></div>';
          return;
        }
        const back = '<button onclick="document.getElementById(\'tabTree\').click()">← Back</button>';
        if (data.isBinary) {
          contentEl.innerHTML = '<div class="file-view"><div class="file-view-header">' + back + '<span class="file-path">' + escapeHtml(filePath) + '</span></div><div class="file-binary">Binary file, cannot preview</div></div>';
        } else {
          const code = escapeHtml(data.content);
          contentEl.innerHTML = '<div class="file-view"><div class="file-view-header">' + back + '<span class="file-path">' + escapeHtml(filePath) + '</span></div><pre><code class="hljs">' + code + '</code></pre></div>';
        }
      }).catch(() => {
        contentEl.innerHTML = '<div class="file-view"><div class="file-view-header">Error loading file</div></div>';
      });
    }
  }

  function renderDir(path: string): h.JSX.Element[] {
    const entries = cacheRef.current[path];
    if (!entries) return [];
    const dirs: TreeEntry[] = [];
    const files: TreeEntry[] = [];
    for (const e of entries) {
      if (e.type === 'directory') dirs.push(e);
      else files.push(e);
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    const all = dirs.concat(files);
    return all.map(e => {
      if (e.type === 'directory') {
        const isExpanded = !!expandedRef.current[e.path];
        return (
          <li class={'ft-item ft-directory' + (isExpanded ? ' ft-expanded' : '')} onClick={(ev: h.JSX.TargetedMouseEvent<HTMLLIElement>) => { ev.stopPropagation(); toggleDir(e.path); }}>
            <span class="ft-toggle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
            <span class="ft-name">{e.name}</span>
            {isExpanded && (
              <ul class="ft-children">
                {renderDir(e.path)}
              </ul>
            )}
          </li>
        );
      }
      const isCurrent = e.path === currentPath;
      return (
        <li class={'ft-item ft-file' + (isCurrent ? ' ft-current' : '')} data-path={e.path} onClick={(ev: h.JSX.TargetedMouseEvent<HTMLLIElement>) => { ev.stopPropagation(); openFile(e.path); }}>
          <span class="ft-toggle ft-vis-hidden"></span>
          <span class="ft-name">{e.name}</span>
        </li>
      );
    });
  }

  return (
    <div>
      <div class="ft-filter">
        <label><input type="checkbox" checked={filters.gitignore} onChange={() => handleFilterChange('gitignore')} /> .gitignore</label>
        <label><input type="checkbox" checked={filters.mdOnly} onChange={() => handleFilterChange('mdOnly')} /> .md</label>
        <label><input type="checkbox" checked={filters.hideBinary} onChange={() => handleFilterChange('hideBinary')} /> Hide binary</label>
        <span class="ft-filter-spacer"></span>
        <button class="ft-locate-btn" onClick={handleLocate} title="Scroll to current file">📍</button>
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
