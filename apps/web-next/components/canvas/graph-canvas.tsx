'use client';

import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';

import { Icon } from '@/components/signal';
import { useI18n } from '@/lib/i18n/i18n';
import { prefersReducedMotion } from '@/lib/preferences';

import {
  arrowPath, bounds, edgeGeometry, edgeKey, edgesWithin, fitHeight, fitView, traceSet,
  type GraphEdge, type GraphNode, type View,
} from './geometry';

/**
 * The canvas engine of V2: pan, zoom, fit, focus, path lighting, hover summary, selection and entry. Nodes are HTML
 * (real text, real focus), edges one SVG layer under them. The camera moves only because a person moved it or the
 * drawing changed shape; nothing here animates on its own.
 */
export interface GraphCanvasProps<T> {
  /** The accessible name of the drawing, e.g. "Mission map". */
  readonly label: string;
  readonly nodes: readonly GraphNode<T>[];
  readonly edges: readonly GraphEdge[];
  readonly render: (node: GraphNode<T>) => ReactNode;
  /** A short reading of a node, shown on hover and focus. */
  readonly tip?: (node: GraphNode<T>) => ReactNode;
  readonly selected?: string | null;
  readonly onSelect?: (id: string | null) => void;
  /** Double-click or Shift + Enter: go to the place the node stands for. The node's element travels with it. */
  readonly onEnter?: (id: string, element: HTMLElement) => void;
  readonly onToggle?: (id: string) => void;
  /** An explicit set to light (everything that serves one requirement). Wins over path tracing. */
  readonly lit?: ReadonlySet<string> | null;
  /** Light the path upstream and downstream of the node under the pointer or the focus. */
  readonly traceOnHover?: boolean;
  /** Keep the path of the selected node lit. */
  readonly traceOnSelect?: boolean;
  /** Changing it refits the camera: a different drawing, not the same drawing updated. */
  readonly fitKey?: string;
  readonly padding?: number;
  readonly maxFit?: number;
  readonly minScale?: number;
  readonly maxScale?: number;
  readonly coords?: boolean;
  readonly className?: string;
  /** Overlays drawn above the canvas: a legend, an inspector. */
  readonly children?: ReactNode;
  /** The canvas grows with its drawing between these heights, so a small company is not lost in a tall frame. */
  readonly height?: { readonly min: number; readonly max: number };
  /** Kept clear at the bottom of the canvas for the legend and the zoom controls. */
  readonly bottom?: number;
}

interface Tip {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly below: boolean;
}

const cssMs = (name: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback;
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};
const ease = (t: number) => 1 - (1 - t) ** 4;

export function GraphCanvas<T>({
  label, nodes, edges, render, tip, selected = null, onSelect, onEnter, onToggle, lit = null,
  traceOnHover = true, traceOnSelect = true, fitKey = '', padding = 40, maxFit = 1.05, minScale = 0.3, maxScale = 2.2,
  coords = false, className, children, height = { min: 320, max: 620 }, bottom = 52,
}: GraphCanvasProps<T>) {
  const { t } = useI18n();
  const helpId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const frame = useRef(0);
  const userMoved = useRef(false);
  const drag = useRef<{ readonly x: number; readonly y: number; readonly vx: number; readonly vy: number; moved: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [tipAt, setTipAt] = useState<Tip | null>(null);

  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const box = useMemo(() => bounds(nodes), [nodes]);

  const applyView = useCallback(() => {
    const world = worldRef.current;
    const viewport = viewportRef.current;
    if (!world || !viewport) return;
    const { x, y, k } = view.current;
    world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    if (coordsRef.current) {
      const cx = Math.max(0, Math.round((viewport.clientWidth / 2 - x) / k));
      const cy = Math.max(0, Math.round((viewport.clientHeight / 2 - y) / k));
      coordsRef.current.textContent = `X ${String(cx).padStart(4, '0')} · Y ${String(cy).padStart(4, '0')} · ${Math.round(k * 100)}%`;
    }
  }, []);

  const tweenTo = useCallback((target: View, duration: number) => {
    cancelAnimationFrame(frame.current);
    if (!duration || prefersReducedMotion()) {
      view.current = target;
      applyView();
      return;
    }
    const from = view.current;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const e = ease(progress);
      view.current = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
      applyView();
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [applyView]);

  const fit = useCallback((animate: boolean) => {
    const viewport = viewportRef.current;
    if (!viewport || nodes.length === 0) return;
    const wide = viewport.clientWidth;
    const tall = viewport.clientHeight;
    if (!wide || !tall) return;
    const target = fitView(box, wide, tall, { padding, minScale, maxFit, bottom });
    tweenTo(target, animate ? cssMs('--m3', 380) : 0);
  }, [bottom, box, maxFit, minScale, nodes.length, padding, tweenTo]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number, animate = true) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const px = cx ?? viewport.clientWidth / 2;
    const py = cy ?? viewport.clientHeight / 2;
    const { x, y, k } = view.current;
    const next = Math.max(minScale, Math.min(maxScale, k * factor));
    const wx = (px - x) / k;
    const wy = (py - y) / k;
    userMoved.current = true;
    tweenTo({ k: next, x: px - wx * next, y: py - wy * next }, animate ? cssMs('--m2', 230) : 0);
  }, [maxScale, minScale, tweenTo]);

  /* A new drawing is fitted before it is painted; the same drawing, updated, keeps the camera where the person left it. */
  const fitted = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (nodes.length === 0) return;
    if (fitted.current === fitKey) return;
    fitted.current = fitKey;
    userMoved.current = false;
    fit(false);
  }, [fit, fitKey, nodes.length]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => { if (!userMoved.current) fitRef.current(false); });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /* Ctrl or ⌘ + wheel zooms at the pointer; a plain wheel keeps scrolling the page. Needs a non-passive listener. */
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomRef.current(Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left, event.clientY - rect.top, false);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest('.gnode[role="button"], .g-toggle')) return;
    cancelAnimationFrame(frame.current);
    drag.current = { x: event.clientX, y: event.clientY, vx: view.current.x, vy: view.current.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('is-panning');
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { current.moved = true; userMoved.current = true; }
    view.current = { ...view.current, x: current.vx + dx, y: current.vy + dy };
    applyView();
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag.current;
    drag.current = null;
    event.currentTarget.classList.remove('is-panning');
    if (current && !current.moved && !cancelled) onSelect?.(null);
  };

  const onViewportKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const step = 60;
    if (event.key === '+' || event.key === '=') zoomAt(1.2);
    else if (event.key === '-') zoomAt(1 / 1.2);
    else if (event.key === '0') { userMoved.current = false; fit(true); }
    else if (event.key === 'Escape') onSelect?.(null);
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      userMoved.current = true;
      const dx = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
      const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
      tweenTo({ ...view.current, x: view.current.x + dx, y: view.current.y + dy }, cssMs('--m1', 140));
    }
  };

  const showTip = (id: string, element: HTMLElement) => {
    const host = hostRef.current;
    if (!tip || !host) return;
    const hostRect = host.getBoundingClientRect();
    const nodeRect = element.getBoundingClientRect();
    const width = 248;
    const left = Math.max(8, Math.min(hostRect.width - width - 8, nodeRect.left - hostRect.left + nodeRect.width / 2 - width / 2));
    const above = nodeRect.top - hostRect.top - 10;
    const below = above < 96;
    setTipAt({ id, left, top: below ? nodeRect.bottom - hostRect.top + 10 : above, below });
  };

  /* What is lit: an explicit set, else the path of the node in focus, else the path of the selection. */
  const source = focus && traceOnHover ? focus : selected && traceOnSelect ? selected : null;
  const lighting = useMemo(() => {
    if (lit) return { nodes: lit, edges: edgesWithin(lit, edges) };
    if (source && byId.has(source)) return traceSet(source, edges);
    return null;
  }, [byId, edges, lit, source]);

  const pad = 400;
  const tipNode = tipAt ? byId.get(tipAt.id) : undefined;
  const tipContent = tipNode && tip ? tip(tipNode) : null;

  const canvasHeight = fitHeight(box, { padding, maxFit, bottom, min: height.min, max: height.max });

  return (
    <div
      ref={hostRef}
      className={`gcanvas${ready ? ' is-ready' : ''}${lighting ? ' is-tracing' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--canvas-h': `${canvasHeight}px` } as CSSProperties}
    >
      <div
        ref={viewportRef}
        className="g-viewport"
        role="group"
        aria-label={label}
        aria-describedby={helpId}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endPan(event, false)}
        onPointerCancel={(event) => endPan(event, true)}
        onKeyDown={onViewportKey}
      >
        <div ref={worldRef} className="g-world">
          <svg
            className="g-edges"
            aria-hidden="true"
            viewBox={`${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`}
            style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }}
          >
            {edges.map((edge) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const geometry = edgeGeometry(from, to, edge);
              const key = edgeKey(edge);
              const state = lighting ? (lighting.edges.has(key) ? ' is-lit' : ' is-dim') : '';
              return (
                <g key={key} className={`gedge${edge.className ? ` ${edge.className}` : ''}${state}`}>
                  <path className="gedge-line" d={geometry.d} style={{ d: `path("${geometry.d}")` } as CSSProperties} />
                  {edge.arrow === false ? null : <path className="gedge-arrow" d={arrowPath(geometry.end)} />}
                </g>
              );
            })}
          </svg>
          <div className="g-labels" aria-hidden="true">
            {edges.map((edge) => {
              if (!edge.label) return null;
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) return null;
              const { mid } = edgeGeometry(from, to, edge);
              const dim = lighting && !lighting.edges.has(edgeKey(edge));
              return (
                <span key={edgeKey(edge)} className={`glabel${dim ? ' is-dim' : ''}`} style={{ transform: `translate(${mid.x}px, ${mid.y}px) translate(-50%, -50%)` }}>
                  {edge.label}
                </span>
              );
            })}
          </div>
          <div className="g-nodes">
            {nodes.map((node) => {
              const interactive = Boolean(node.label);
              const state = lighting ? (lighting.nodes.has(node.id) ? ' is-lit' : ' is-dim') : '';
              const style: CSSProperties = { transform: `translate(${node.x}px, ${node.y}px)`, width: node.w, height: node.h };
              if (!interactive) {
                return <div key={node.id} className={`gnode is-inert${node.className ? ` ${node.className}` : ''}`} style={style} aria-hidden="true">{render(node)}</div>;
              }
              return (
                <div
                  key={node.id}
                  data-node={node.id}
                  className={`gnode${node.className ? ` ${node.className}` : ''}${selected === node.id ? ' is-selected' : ''}${state}`}
                  style={style}
                  role="button"
                  tabIndex={0}
                  aria-label={node.label}
                  aria-pressed={selected === node.id}
                  onClick={() => onSelect?.(node.id)}
                  onDoubleClick={(event) => onEnter?.(node.id, event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.shiftKey) { event.preventDefault(); onEnter?.(node.id, event.currentTarget); }
                    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect?.(node.id); }
                    else if (event.key === 'Escape') onSelect?.(null);
                  }}
                  onPointerEnter={(event) => { setFocus(node.id); showTip(node.id, event.currentTarget); }}
                  onPointerLeave={() => { setFocus(null); setTipAt(null); }}
                  onFocus={(event) => { setFocus(node.id); showTip(node.id, event.currentTarget); }}
                  onBlur={() => { setFocus(null); setTipAt(null); }}
                >
                  {render(node)}
                </div>
              );
            })}
            {nodes.map((node) => {
              if (!node.toggle) return null;
              const anchor = node.anchor ?? { x: 0, y: 0, w: node.w, h: node.h };
              const at = node.toggle.at === 'left'
                ? `translate(${node.x - 11}px, ${node.y + node.h / 2 - 11}px)`
                : `translate(${node.x + anchor.x + anchor.w - 10}px, ${node.y + anchor.y - 10}px)`;
              return (
                <button
                  key={`${node.id}:toggle`}
                  className="g-toggle"
                  type="button"
                  aria-expanded={node.toggle.expanded}
                  aria-label={node.toggle.label}
                  title={node.toggle.label}
                  style={{ transform: at }}
                  onClick={() => onToggle?.(node.id)}
                >
                  <span aria-hidden="true">{node.toggle.expanded ? '−' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p id={helpId} className="sr-only">{t('canvas.help')}</p>
      {coords ? <span ref={coordsRef} className="g-coords" aria-hidden="true" /> : null}
      <div className="g-controls" role="toolbar" aria-label={t('canvas.controls')}>
        <button className="iconbtn" type="button" onClick={() => zoomAt(1.25)} aria-label={t('canvas.zoomIn')} title={t('canvas.zoomIn')}>
          <Icon name="zoom-in" />
        </button>
        <button className="iconbtn" type="button" onClick={() => zoomAt(1 / 1.25)} aria-label={t('canvas.zoomOut')} title={t('canvas.zoomOut')}>
          <Icon name="zoom-out" />
        </button>
        <button className="iconbtn" type="button" onClick={() => { userMoved.current = false; fit(true); }} aria-label={t('canvas.fit')} title={t('canvas.fit')}>
          <Icon name="fit" />
        </button>
      </div>
      {tipContent && tipAt ? (
        <div className={`g-tip${tipAt.below ? ' is-below' : ''}`} role="tooltip" style={{ transform: `translate(${tipAt.left}px, ${tipAt.top}px)${tipAt.below ? '' : ' translateY(-100%)'}` }}>
          {tipContent}
        </div>
      ) : null}
      {children}
    </div>
  );
}
