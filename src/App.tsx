import React, { useEffect } from 'react';
import WorldView from './ui/WorldView';
import { useStore } from './state/store';
import { World } from './simulation/world';
import { Creature } from './simulation/creature';
import { DEFAULT_TRAITS } from './utils/traits';
import { SIMULATION_CONSTANTS } from './utils/constants';

export default function App() {
  // Initialize mock world state for demonstration
  useEffect(() => {
    const world = new World(100, 100, SIMULATION_CONSTANTS);

    // Add some mock biomass to cells (energy is already initialized from solar grid)
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        // Add some biomass randomly
        const biomass = Math.random() > 0.7 ? Math.random() * 30 : 0;

        if (biomass > 0) {
          world.setCell(x, y, { producerBiomass: biomass });
        }
      }
    }

    // Create some mock creatures
    const mockCreatures: Array<any> = [
      {
        x: 30,
        y: 30,
        speciesId: 'herbivore_001',
        energy: 100,
      },
      {
        x: 50,
        y: 50,
        speciesId: 'carnivore_001',
        energy: 150,
      },
      {
        x: 70,
        y: 70,
        speciesId: 'omnivore_001',
        energy: 120,
      },
      {
        x: 25,
        y: 75,
        speciesId: 'herbivore_001',
        energy: 80,
      },
      {
        x: 75,
        y: 25,
        speciesId: 'scavenger_001',
        energy: 90,
      },
    ];

    // Set the mock world state
    const store = useStore.getState();
    const worldJSON = world.toJSON() as any;
    store.setWorldState({
      width: worldJSON.width,
      height: worldJSON.height,
      cells: worldJSON.cells,
      creatures: mockCreatures,
    });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', backgroundColor: '#1a1a1a', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <h1 style={{ margin: '0 0 0.5rem 0' }}>Project Origins</h1>
        <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
          A persistent ecosystem simulation — 100×100 world grid
        </p>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <WorldView />
      </div>
    </div>
  );
}
