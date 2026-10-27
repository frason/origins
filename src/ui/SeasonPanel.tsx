/**
 * Season calendar + forecast panel (#356 UI, mounted in the world view by #354/#121).
 *
 * Reads the live season config and tick from the store. Renders nothing when the world has no
 * seasons, so pre-season worlds show no season UI. Latitude and base temperature come from the
 * selected tile when one is chosen, otherwise from the grid's middle row.
 */
import { useStore } from '../state/store';
import { latitudeDegForRow } from '../simulation/seasons';
import { temperatureToBP } from '../simulation/seasonEffects';
import SeasonCalendarBar from './SeasonCalendarBar';
import SeasonForecastStrip from './SeasonForecastStrip';

export default function SeasonPanel() {
  const { seasonConfig, tick, selectedTile, constants, worldState } = useStore();
  if (!seasonConfig) return null;

  const height = worldState?.height ?? constants.worldHeight;
  const width = worldState?.width ?? constants.worldWidth;
  const rowY = selectedTile ? selectedTile.y : Math.floor(height / 2);
  const latitudeDeg = latitudeDegForRow(rowY, height, seasonConfig.gridMaxLatitudeDeg);
  const cell = selectedTile && worldState
    ? worldState.cells[selectedTile.y * width + selectedTile.x]
    : undefined;
  const baseTemperatureBP = cell ? temperatureToBP(cell.temperature) : undefined;

  return (
    <section className="season-panel" aria-label="Seasons">
      <SeasonCalendarBar
        tick={tick}
        config={seasonConfig}
        cursorLatitudeDeg={latitudeDeg}
      />
      <SeasonForecastStrip
        tick={tick}
        config={seasonConfig}
        latitudeDeg={latitudeDeg}
        baseTemperatureBP={baseTemperatureBP}
      />
    </section>
  );
}
