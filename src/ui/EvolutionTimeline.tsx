'use client';

import { useState, useRef, useCallback } from 'react';
import { useStore } from '../state/store';
import { buildEvolutionTimeline } from './evolutionTimelineModel';
import type { EventPin } from './evolutionTimelineModel';

const CHART_PADDING = { top: 12, right: 40, bottom: 30, left: 50 };
const CHART_WIDTH = 100 - CHART_PADDING.left - CHART_PADDING.right;
const CHART_HEIGHT = 100 - CHART_PADDING.top - CHART_PADDING.bottom;

type MetricType = 'population' | 'species' | 'lineages';
type EventType = 'birth' | 'death' | 'extinction' | 'speciation' | 'intervention' | 'mutation' | 'environmental-shock';
type RegionType = 'NW' | 'NE' | 'SW' | 'SE' | 'center';

interface FilterState {
  metrics: Set<MetricType>;
  eventTypes: Set<EventType>;
  speciesFilter: Set<string> | null;
  lineageFilter: Set<string> | null;
  regionFilter: Set<RegionType> | null;
}

export default function EvolutionTimeline() {
  const world = useStore((state) => state.worldState);
  const tick = useStore((state) => state.tick);
  const setSelectedTile = useStore((state) => state.setSelectedTile);
  const toggleFollowedLineage = useStore((state) => state.toggleFollowedLineage);
  const model = buildEvolutionTimeline(world?.history, world, tick);

  // Filter state
  const [filterState, setFilterState] = useState<FilterState>({
    metrics: new Set(['population', 'species', 'lineages']),
    eventTypes: new Set(['birth', 'extinction', 'speciation', 'intervention', 'environmental-shock']),
    speciesFilter: null,
    lineageFilter: null,
    regionFilter: null,
  });

  const [hoveredEvent, setHoveredEvent] = useState<EventPin | null>(null);
  const [selectedInterventionWindow, setSelectedInterventionWindow] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!model) return null;

  const toggleMetric = (metric: MetricType) => {
    setFilterState((prev) => {
      const newMetrics = new Set(prev.metrics);
      newMetrics.has(metric) ? newMetrics.delete(metric) : newMetrics.add(metric);
      return { ...prev, metrics: newMetrics };
    });
  };

  const toggleEventType = (eventType: EventType) => {
    setFilterState((prev) => {
      const newEventTypes = new Set(prev.eventTypes);
      newEventTypes.has(eventType) ? newEventTypes.delete(eventType) : newEventTypes.add(eventType);
      return { ...prev, eventTypes: newEventTypes };
    });
  };

  const toggleSpeciesFilter = (speciesId: string) => {
    setFilterState((prev) => {
      if (prev.speciesFilter?.has(speciesId)) {
        const newFilter = new Set(prev.speciesFilter);
        newFilter.delete(speciesId);
        return { ...prev, speciesFilter: newFilter.size > 0 ? newFilter : null };
      }
      const newFilter = new Set(prev.speciesFilter ?? []);
      newFilter.add(speciesId);
      return { ...prev, speciesFilter: newFilter };
    });
  };

  const toggleLineageFilter = (lineageId: string) => {
    setFilterState((prev) => {
      if (prev.lineageFilter?.has(lineageId)) {
        const newFilter = new Set(prev.lineageFilter);
        newFilter.delete(lineageId);
        return { ...prev, lineageFilter: newFilter.size > 0 ? newFilter : null };
      }
      const newFilter = new Set(prev.lineageFilter ?? []);
      newFilter.add(lineageId);
      return { ...prev, lineageFilter: newFilter };
    });
  };

  const toggleRegionFilter = (region: RegionType) => {
    setFilterState((prev) => {
      if (prev.regionFilter?.has(region)) {
        const newFilter = new Set(prev.regionFilter);
        newFilter.delete(region);
        return { ...prev, regionFilter: newFilter.size > 0 ? newFilter : null };
      }
      const newFilter = new Set(prev.regionFilter ?? []);
      newFilter.add(region);
      return { ...prev, regionFilter: newFilter };
    });
  };

  const filteredEventPins = model.eventPins.filter((pin) => {
    if (!filterState.eventTypes.has(pin.type)) return false;
    if (filterState.speciesFilter && pin.event.speciesId && !filterState.speciesFilter.has(pin.event.speciesId)) return false;
    if (filterState.lineageFilter && pin.lineageId) {
      const lineageId = `${pin.event.speciesId}:${pin.lineageId}`;
      if (!filterState.lineageFilter.has(lineageId)) return false;
    }
    if (filterState.regionFilter && pin.region && !filterState.regionFilter.has(pin.region)) return false;
    return true;
  });

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const newScale = Math.max(1, Math.min(3, zoomScale + (e.deltaY > 0 ? -0.1 : 0.1)));
    setZoomScale(newScale);
  }, [zoomScale]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setPanX((prev) => Math.max(-CHART_WIDTH * (zoomScale - 1), prev - 5));
    if (e.key === 'ArrowRight') setPanX((prev) => Math.min(0, prev + 5));
    if (e.key === 'ArrowUp') setPanY((prev) => Math.max(-CHART_HEIGHT * (zoomScale - 1), prev - 5));
    if (e.key === 'ArrowDown') setPanY((prev) => Math.min(0, prev + 5));
    if (e.key === '+' || e.key === '=') setZoomScale((prev) => Math.min(3, prev + 0.1));
    if (e.key === '-') setZoomScale((prev) => Math.max(1, prev - 0.1));
    if (e.key === '0') {
      setZoomScale(1);
      setPanX(0);
      setPanY(0);
    }
  };

  const handleEventPinClick = (pin: EventPin) => {
    // Navigate to tile if available
    if (pin.tileX !== undefined && pin.tileY !== undefined) {
      setSelectedTile({ x: pin.tileX, y: pin.tileY });
    }
    // Add to followed lineages if available
    if (pin.lineageId && pin.event.speciesId) {
      toggleFollowedLineage({
        speciesId: pin.event.speciesId,
        lineageId: pin.lineageId,
      });
    }
  };

  // Touch/pointer event handler for both mouse and touch devices
  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Prevent default to allow custom handling
    if (e.isPrimary) {
      // Store initial pan/zoom state for potential drag
      (svgRef.current as any)._startX = e.clientX;
      (svgRef.current as any)._startPanX = panX;
    }
  }, [panX]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.isPrimary) {
      delete (svgRef.current as any)._startX;
      delete (svgRef.current as any)._startPanX;
    }
  }, []);

  const isZoomed = zoomScale > 1.05;

  // SVG viewBox and transform for zoom/pan
  const chartMinX = CHART_PADDING.left + panX;
  const chartMinY = CHART_PADDING.top + panY;
  const chartViewWidth = CHART_WIDTH / zoomScale;
  const chartViewHeight = CHART_HEIGHT / zoomScale;

  return (
    <details open style={{ border: '1px solid #384348', borderRadius: 7, padding: '0.55rem', marginBottom: '0.7rem' }}>
      <summary style={{ cursor: 'pointer', color: '#b8ccd4', fontWeight: 600 }}>
        Observatory: Evolution Timeline
      </summary>

      <div style={{ marginTop: '0.4rem' }} onKeyDown={handleKeyDown} tabIndex={0}>
        {/* Filters Toggle */}
        <div style={{ marginBottom: '0.3rem' }}>
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              background: 'none',
              border: '1px solid #5a6368',
              color: '#9dc6d8',
              padding: '0.3rem 0.5rem',
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: '0.65rem',
              fontWeight: 600,
            }}
          >
            {showFilters ? '▾' : '▸'} Filters & Events
          </button>
        </div>

        {/* Collapsible Filter Panel */}
        {showFilters && (
          <div
            style={{
              background: '#1a2023',
              border: '1px solid #384348',
              borderRadius: 5,
              padding: '0.5rem',
              marginBottom: '0.5rem',
              fontSize: '0.65rem',
              color: '#9dc6d8',
            }}
          >
            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Metrics:</strong>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                {(['population', 'species', 'lineages'] as MetricType[]).map((metric) => (
                  <label
                    key={metric}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterState.metrics.has(metric)}
                      onChange={() => toggleMetric(metric)}
                      style={{ cursor: 'pointer' }}
                    />
                    {metric}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Events:</strong>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                {(['birth', 'death', 'mutation', 'extinction', 'speciation', 'intervention', 'environmental-shock'] as EventType[]).map((eventType) => (
                  <label
                    key={eventType}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={filterState.eventTypes.has(eventType)}
                      onChange={() => toggleEventType(eventType)}
                      style={{ cursor: 'pointer' }}
                    />
                    {eventType}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '0.3rem' }}>
              <strong>Regions:</strong>
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                {(['NW', 'NE', 'SW', 'SE', 'center'] as RegionType[]).map((region) => (
                  <button
                    key={region}
                    onClick={() => toggleRegionFilter(region)}
                    style={{
                      background: filterState.regionFilter?.has(region) ? '#f5a962' : '#2a3235',
                      color: filterState.regionFilter?.has(region) ? '#000' : '#9dc6d8',
                      border: 'none',
                      padding: '0.15rem 0.35rem',
                      borderRadius: 3,
                      cursor: 'pointer',
                      fontSize: '0.6rem',
                    }}
                  >
                    {region}
                  </button>
                ))}
              </div>
            </div>

            {model.allSpeciesIds.size > 0 && (
              <div style={{ marginBottom: '0.3rem' }}>
                <strong>Species ({model.allSpeciesIds.size}):</strong>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.3rem',
                    flexWrap: 'wrap',
                    marginTop: '0.2rem',
                    maxHeight: '80px',
                    overflowY: 'auto',
                  }}
                >
                  {[...model.allSpeciesIds].sort().map((speciesId) => (
                    <button
                      key={speciesId}
                      onClick={() => toggleSpeciesFilter(speciesId)}
                      style={{
                        background: filterState.speciesFilter?.has(speciesId) ? '#ad91d5' : '#2a3235',
                        color: filterState.speciesFilter?.has(speciesId) ? '#000' : '#9dc6d8',
                        border: 'none',
                        padding: '0.15rem 0.35rem',
                        borderRadius: 3,
                        cursor: 'pointer',
                        fontSize: '0.6rem',
                      }}
                    >
                      {speciesId.substring(0, 8)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {model.allLineageIds.size > 0 && (
              <div>
                <strong>Lineages ({model.allLineageIds.size}):</strong>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.3rem',
                    flexWrap: 'wrap',
                    marginTop: '0.2rem',
                    maxHeight: '100px',
                    overflowY: 'auto',
                  }}
                >
                  {[...model.allLineageIds].sort().map((lineageId) => (
                    <button
                      key={lineageId}
                      onClick={() => toggleLineageFilter(lineageId)}
                      title={model.allLineageLabels.get(lineageId)}
                      style={{
                        background: filterState.lineageFilter?.has(lineageId) ? '#78cf83' : '#2a3235',
                        color: filterState.lineageFilter?.has(lineageId) ? '#000' : '#9dc6d8',
                        border: 'none',
                        padding: '0.15rem 0.35rem',
                        borderRadius: 3,
                        cursor: 'pointer',
                        fontSize: '0.55rem',
                      }}
                    >
                      {lineageId.substring(0, 12)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Chart */}
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          role="img"
          aria-labelledby="evolution-chart-title evolution-chart-description"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          style={{
            display: 'block',
            width: '100%',
            height: 'clamp(200px, 35vw, 300px)',
            background: '#191d1f',
            borderRadius: 5,
            cursor: isZoomed ? 'grab' : 'default',
            touchAction: 'none',
            overflow: 'visible',
          }}
        >
          <title id="evolution-chart-title">Population and diversity timeline</title>
          <desc id="evolution-chart-description">{model.description}</desc>

          <defs>
            <clipPath id="chart-area">
              <rect x={CHART_PADDING.left} y={CHART_PADDING.top} width={CHART_WIDTH} height={CHART_HEIGHT} />
            </clipPath>
          </defs>

          {/* Intervention shading */}
          <g id="intervention-windows" clipPath="url(#chart-area)">
            {model.interventionWindows.map((window, idx) => (
              <rect
                key={idx}
                x={CHART_PADDING.left + (window.startX / 100) * CHART_WIDTH}
                y={CHART_PADDING.top}
                width={(Math.abs(window.endX - window.startX) / 100) * CHART_WIDTH}
                height={CHART_HEIGHT}
                fill="#70c7d8"
                opacity={selectedInterventionWindow === idx ? 0.2 : 0.08}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                onClick={() => setSelectedInterventionWindow(selectedInterventionWindow === idx ? null : idx)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  setSelectedInterventionWindow(selectedInterventionWindow === idx ? null : idx);
                }}
              />
            ))}
          </g>

          {/* Zoom/Pan Group */}
          <g transform={`translate(${panX * (CHART_WIDTH / 100)}, ${panY * (CHART_HEIGHT / 100)}) scale(${zoomScale})`}>
            {/* Background grid */}
            <g id="grid" opacity="0.15">
              {model.yAxisScale.ticks.slice(1, -1).map((tick, idx) => {
                const y = CHART_PADDING.top + CHART_HEIGHT - (tick / model.peakPopulation) * CHART_HEIGHT;
                return (
                  <line
                    key={`grid-h-${idx}`}
                    x1={CHART_PADDING.left}
                    y1={y}
                    x2={CHART_PADDING.left + CHART_WIDTH}
                    y2={y}
                    stroke="#41484b"
                    strokeWidth="0.3"
                    strokeDasharray="1,1"
                  />
                );
              })}
            </g>

            {/* Data lines */}
            <g id="chart-lines" clipPath="url(#chart-area)">
              {filterState.metrics.has('population') && (
                <polyline
                  points={model.populationPolyline}
                  fill="none"
                  stroke="var(--sim-color-screen-positive-soft)"
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {filterState.metrics.has('species') && (
                <polyline
                  points={model.speciesPolyline}
                  fill="none"
                  stroke="#d5b96f"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {filterState.metrics.has('lineages') && (
                <polyline
                  points={model.lineagePolyline}
                  fill="none"
                  stroke="#ad91d5"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          </g>

          {/* Axes (always visible, not zoomed) */}
          {/* Y-axis */}
          <line
            x1={CHART_PADDING.left}
            y1={CHART_PADDING.top}
            x2={CHART_PADDING.left}
            y2={CHART_PADDING.top + CHART_HEIGHT}
            stroke="#41484b"
            strokeWidth="0.6"
          />

          {/* Y-axis ticks and labels */}
          {model.yAxisScale.ticks.map((tick, idx) => {
            const y = CHART_PADDING.top + CHART_HEIGHT - (tick / model.peakPopulation) * CHART_HEIGHT;
            return (
              <g key={`y-tick-${idx}`}>
                <line x1={CHART_PADDING.left - 2} y1={y} x2={CHART_PADDING.left} y2={y} stroke="#41484b" strokeWidth="0.5" />
                <text x={CHART_PADDING.left - 3} y={y + 1.5} fontSize="1.8" fill="#7f898d" textAnchor="end" dominantBaseline="middle">
                  {model.yAxisScale.labels[idx]}
                </text>
              </g>
            );
          })}

          {/* X-axis */}
          <line
            x1={CHART_PADDING.left}
            y1={CHART_PADDING.top + CHART_HEIGHT}
            x2={CHART_PADDING.left + CHART_WIDTH}
            y2={CHART_PADDING.top + CHART_HEIGHT}
            stroke="#41484b"
            strokeWidth="0.6"
          />

          {/* X-axis ticks and labels */}
          {model.xAxisScale.ticks.map((tick, idx) => {
            const x = CHART_PADDING.left + (tick / model.lastTick) * CHART_WIDTH;
            return (
              <g key={`x-tick-${idx}`}>
                <line x1={x} y1={CHART_PADDING.top + CHART_HEIGHT} x2={x} y2={CHART_PADDING.top + CHART_HEIGHT + 2} stroke="#41484b" strokeWidth="0.5" />
                <text x={x} y={CHART_PADDING.top + CHART_HEIGHT + 5} fontSize="1.8" fill="#7f898d" textAnchor="middle">
                  {model.xAxisScale.labels[idx]}
                </text>
              </g>
            );
          })}

          {/* Event pins (not zoomed to maintain clickability) */}
          <g id="event-pins">
            {filteredEventPins.map((pin) => {
              const xPos = CHART_PADDING.left + (pin.x / 100) * CHART_WIDTH;
              const yPos = CHART_PADDING.top + 3;
              const pinColors: Record<string, string> = {
                birth: '#78cf83',
                extinction: '#ef7c7c',
                speciation: '#d5b96f',
                mutation: 'var(--sim-color-screen-accent)',
                intervention: '#70c7d8',
                death: '#ff6b6b',
                'environmental-shock': '#ff9800',
              };
              const color = pinColors[pin.type] || '#9dc6d8';

              return (
                <g
                  key={pin.id}
                  onMouseEnter={() => setHoveredEvent(pin)}
                  onMouseLeave={() => setHoveredEvent(null)}
                  onClick={() => handleEventPinClick(pin)}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    setHoveredEvent(hoveredEvent?.id === pin.id ? null : pin);
                    handleEventPinClick(pin);
                  }}
                >
                  <circle
                    cx={xPos}
                    cy={yPos}
                    r="1.2"
                    fill={color}
                    opacity={hoveredEvent?.id === pin.id ? 1 : 0.65}
                    style={{ cursor: 'pointer' }}
                  />
                  {hoveredEvent?.id === pin.id && (
                    <title>{`${pin.type}: ${pin.detail} @ tick ${pin.tick}`}</title>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.35rem', color: 'var(--sim-color-screen-muted-blue)', fontSize: '0.65rem' }}>
          <span style={{ color: 'var(--sim-color-screen-positive-soft)' }}>— Population</span>
          <span style={{ color: '#d5b96f' }}>— Species</span>
          <span style={{ color: '#ad91d5' }}>— Lineages</span>
          <span style={{ color: '#78cf83' }}>• Birth</span>
          <span style={{ color: '#ef7c7c' }}>• Extinction</span>
          <span style={{ color: '#70c7d8' }}>⚙ Intervention</span>
          <span style={{ color: '#ff9800' }}>⚡ Shock</span>
        </div>

        {/* Hovered Event Details */}
        {hoveredEvent && (
          <div
            style={{
              background: '#2a3235',
              border: '1px solid #41484b',
              borderRadius: 4,
              padding: '0.4rem 0.5rem',
              marginTop: '0.3rem',
              fontSize: '0.65rem',
              color: '#9dc6d8',
            }}
          >
            <strong>{hoveredEvent.type}:</strong> {hoveredEvent.detail} @ tick {hoveredEvent.tick}
            {hoveredEvent.region && (
              <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>Region: {hoveredEvent.region}</div>
            )}
            {(hoveredEvent.tileX !== undefined || hoveredEvent.lineageId) && (
              <div style={{ marginTop: '0.2rem', fontSize: '0.6rem', opacity: 0.8 }}>
                Click to {hoveredEvent.tileX !== undefined ? 'view tile' : ''}{hoveredEvent.tileX !== undefined && hoveredEvent.lineageId ? ' or ' : ''}{hoveredEvent.lineageId ? 'follow lineage' : ''}
              </div>
            )}
          </div>
        )}

        {/* Selected Intervention Window Details (Before/After Comparison) */}
        {selectedInterventionWindow !== null && model.interventionWindows[selectedInterventionWindow] && (
          <div
            style={{
              background: '#1f2a2d',
              border: '2px solid #70c7d8',
              borderRadius: 4,
              padding: '0.5rem',
              marginTop: '0.3rem',
              fontSize: '0.65rem',
              color: '#9dc6d8',
            }}
          >
            <div style={{ marginBottom: '0.2rem', fontWeight: 600, color: '#70c7d8' }}>
              Intervention: {model.interventionWindows[selectedInterventionWindow].kind}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.6rem' }}>
              <div>
                <div style={{ opacity: 0.7, marginBottom: '0.1rem' }}>Before</div>
                <div>Pop: {model.interventionWindows[selectedInterventionWindow].beforePopulation ?? '?'}</div>
                <div>Spp: {model.interventionWindows[selectedInterventionWindow].beforeSpecies ?? '?'}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ opacity: 0.7, marginBottom: '0.1rem' }}>Change</div>
                <div style={{ color: (model.interventionWindows[selectedInterventionWindow].populationDelta ?? 0) >= 0 ? '#78cf83' : '#ff6b6b' }}>
                  {(model.interventionWindows[selectedInterventionWindow].populationDelta ?? 0) >= 0 ? '+' : ''}{model.interventionWindows[selectedInterventionWindow].populationDelta}
                </div>
                <div style={{ color: (model.interventionWindows[selectedInterventionWindow].speciesDelta ?? 0) >= 0 ? '#78cf83' : '#ff6b6b' }}>
                  {(model.interventionWindows[selectedInterventionWindow].speciesDelta ?? 0) >= 0 ? '+' : ''}{model.interventionWindows[selectedInterventionWindow].speciesDelta} spp
                </div>
              </div>
              <div>
                <div style={{ opacity: 0.7, marginBottom: '0.1rem' }}>After</div>
                <div>Pop: {model.interventionWindows[selectedInterventionWindow].afterPopulation ?? '?'}</div>
                <div>Spp: {model.interventionWindows[selectedInterventionWindow].afterSpecies ?? '?'}</div>
              </div>
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.55rem', opacity: 0.7 }}>
              Ticks: {model.interventionWindows[selectedInterventionWindow].startTick}–{model.interventionWindows[selectedInterventionWindow].endTick}
            </div>
          </div>
        )}

        {/* Info and Controls */}
        <div style={{ color: '#7f898d', fontSize: '0.66rem', lineHeight: 1.4, marginTop: '0.3rem' }}>
          <div>
            Peak {model.peakPopulation} · {model.dominanceChanges} dominance {model.dominanceChanges === 1 ? 'shift' : 'shifts'} · {model.currentDominantName ? `${model.currentDominantName} leads now` : 'no living leader'}
          </div>
          <div style={{ marginTop: '0.2rem', opacity: 0.8 }}>
            {isZoomed && (
              <>
                Zoom: {(zoomScale * 100).toFixed(0)}% | Pan: Arrow Keys | Reset: 0 | Click pins to focus
              </>
            )}
            {!isZoomed && (
              <>
                Ctrl+Scroll to zoom | Arrow Keys to pan | Press 0 to reset | Click pins to focus
              </>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
