
import React, { useReducer, useEffect, useCallback, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// --- CONSTANTS ---
const GRID_ROWS = 5;
const GRID_COLS = 9;
const CELL_SIZE = 80; // In pixels
const TICK_RATE = 1000 / 60; // 60 FPS

// Game Balance
const INITIAL_SUNS = 50;
const PEASHOOTER_COST = 100;
const SUNFLOWER_COST = 50;
const POTATOMINE_COST = 25;
const CHERRYBOMB_COST = 150;
const REPEATER_COST = 250;
const CUCUMBER_COST = 75;
const EGGPLANT_COST = 100;
const STRAWBERRY_COST = 75;
const WEED_COST = 25;
const SUN_VALUE = 25;
const MAX_SUNS = 500;
const NORMAL_ZOMBIE_HEALTH = 3;
const FAST_ZOMBIE_HEALTH = 3; // Less health for balance
const ARMOR_ZOMBIE_HEALTH = 10;
const MAGIC_ZOMBIE_HEALTH = 5;
const EGGPLANT_DAMAGE = 15;
const STRAWBERRY_DAMAGE = 15;

// Timings (in ms)
const PREPARATION_TIME = 60000; // 60 seconds
const PLANT_FIRE_RATE = 2000;
const CUCUMBER_ATTACK_RATE = 1000;
const MAGIC_BALL_FIRE_RATE = 5000;
const NATURAL_SUN_SPAWN_RATE = 8000;
const SUNFLOWER_PRODUCE_RATE = 15000;
const POTATOMINE_ARM_TIME = 7500;
const STRAWBERRY_SLEEP_TIME = 20000; // 25 seconds
const EXPLOSION_DURATION = 400;
const WAVE_TRANSITION_DELAY = 4000; // Time for announcements

// Cooldowns (in ms)
const PEASHOOTER_COOLDOWN = 12500;
const SUNFLOWER_COOLDOWN = 10000;
const POTATOMINE_COOLDOWN = 25000;
const CHERRYBOMB_COOLDOWN = 30000;
const REPEATER_COOLDOWN = 15000;
const CUCUMBER_COOLDOWN = 20000;
const EGGPLANT_COOLDOWN = 17500;
const STRAWBERRY_COOLDOWN = 30000;
const WEED_COOLDOWN = 10000;

// Physics & Hitboxes
const NORMAL_ZOMBIE_SPEED = 0.5; // Pixels per tick
const FAST_ZOMBIE_SPEED = 1.0; // Pixels per tick
const ARMOR_ZOMBIE_SPEED = 0.25; // Pixels per tick
const MAGIC_ZOMBIE_SPEED = 0.6; // Pixels per tick
const PEA_SPEED = 4; // Pixels per tick
const EGGPLANT_SPEED = 3; // Pixels per tick
const MAGIC_BALL_SPEED = 4; // Pixels per tick
const SUN_FALL_SPEED = 1; // Pixels per tick
const ZOMBIE_HIT_WIDTH = 40;
const PEA_HIT_WIDTH = 10;

// --- TYPES ---
type PlantType = 'PEASHOOTER' | 'SUNFLOWER' | 'POTATOMINE' | 'CHERRYBOMB' | 'REPEATER' | 'CUCUMBER' | 'EGGPLANT' | 'STRAWBERRY' | 'WEED';
type ZombieType = 'NORMAL' | 'FAST' | 'ARMOR' | 'MAGIC';
interface Plant {
  id: number;
  row: number;
  col: number;
  type: PlantType;
  armTime?: number;
  attackCooldown?: number;
  isAttacking?: boolean;
  attackAnimationTimer?: number;
  isSleeping?: boolean;
  sleepTimer?: number;
}
interface RunnerPlant { id: number; row: number; x: number; type: 'EGGPLANT'; }
interface Zombie { id: number; row: number; x: number; health: number; type: ZombieType; attackCooldown?: number; isSlowed?: boolean; }
interface Projectile { id: number; row: number; x: number; }
interface MagicBall { id: number; row: number; x: number; }
interface Sun { id: number; x: number; y: number; isFalling: boolean; targetY: number; }
interface Explosion { id: number; row: number; col: number; ttl: number; isLarge: boolean; }
interface HitSplat { id: number; row: number; x: number; ttl: number; }
type Challenge = { type: 'NO_SUNFLOWER' | 'BOOM' | 'BRUTAL'; waves: number; } | null;
type GameStatus = 'MENU' | 'PLANT_SELECTION' | 'CHALLENGE_SELECTION' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'VICTORY';

interface GameState {
  gameStatus: GameStatus;
  plants: Plant[];
  runnerPlants: RunnerPlant[];
  zombies: Zombie[];
  projectiles: Projectile[];
  magicBalls: MagicBall[];
  suns: number;
  sunsToCollect: Sun[];
  explosions: Explosion[];
  hitSplats: HitSplat[];
  selectedPlant: PlantType | null;
  cooldowns: { [key in PlantType]: number };
  nextIds: { plant: number; zombie: number; projectile: number; sun: number; explosion: number; hitSplat: number; magicBall: number; runnerPlant: number; };
  preparationTimeLeft: number;
  chosenPlants: PlantType[];
  challenge: Challenge;
  // Wave state
  waves: any[]; // Holds the configuration for all waves in the current game
  currentWave: number;
  totalZombiesInWave: number;
  zombieSpawnList: ZombieType[];
  zombieSpawnRate: number;
  waveAnnouncement: string | null;
}

type GameAction =
  | { type: 'START_PLANT_SELECTION' }
  | { type: 'START_CHALLENGE_SELECTION' }
  | { type: 'START_CHALLENGE'; payload: NonNullable<Challenge> }
  | { type: 'BACK_TO_MENU' }
  | { type: 'CONFIRM_PLANT_SELECTION'; payload: PlantType[] }
  | { type: 'RESTART_GAME' }
  | { type: 'TICK' }
  | { type: 'SELECT_PLANT'; payload: PlantType }
  | { type: 'PLACE_PLANT'; payload: { row: number; col: number } }
  | { type: 'START_WAVE' }
  | { type: 'SPAWN_ZOMBIE' }
  | { type: 'PLANTS_FIRE' }
  | { type: 'SPAWN_NATURAL_SUN' }
  | { type: 'SUNFLOWERS_PRODUCE_SUN' }
  | { type: 'PAUSE_GAME' }
  | { type: 'RESUME_GAME' }
  | { type: 'COLLECT_SUN'; payload: { id: number } };

// --- PLANT DATA ---
const plantData: { [key in PlantType]: { cost: number; cooldown: number } } = {
  PEASHOOTER: { cost: PEASHOOTER_COST, cooldown: PEASHOOTER_COOLDOWN },
  SUNFLOWER: { cost: SUNFLOWER_COST, cooldown: SUNFLOWER_COOLDOWN },
  POTATOMINE: { cost: POTATOMINE_COST, cooldown: POTATOMINE_COOLDOWN },
  CHERRYBOMB: { cost: CHERRYBOMB_COST, cooldown: CHERRYBOMB_COOLDOWN },
  REPEATER: { cost: REPEATER_COST, cooldown: REPEATER_COOLDOWN },
  CUCUMBER: { cost: CUCUMBER_COST, cooldown: CUCUMBER_COOLDOWN },
  EGGPLANT: { cost: EGGPLANT_COST, cooldown: EGGPLANT_COOLDOWN },
  STRAWBERRY: { cost: STRAWBERRY_COST, cooldown: STRAWBERRY_COOLDOWN },
  WEED: { cost: WEED_COST, cooldown: WEED_COOLDOWN },
};

// --- ZOMBIE DATA ---
const zombieData: { [key in ZombieType]: { health: number; speed: number; } } = {
  NORMAL: { health: NORMAL_ZOMBIE_HEALTH, speed: NORMAL_ZOMBIE_SPEED },
  FAST: { health: FAST_ZOMBIE_HEALTH, speed: FAST_ZOMBIE_SPEED },
  ARMOR: { health: ARMOR_ZOMBIE_HEALTH, speed: ARMOR_ZOMBIE_SPEED },
  MAGIC: { health: MAGIC_ZOMBIE_HEALTH, speed: MAGIC_ZOMBIE_SPEED },
};

// Wave Configuration
const generateNormalWaves = (count: number) => {
    const waves = [];
    for (let i = 0; i < count; i++) {
        const normal = 5 + i;
        const fast = i >= 2 ? 2 + Math.floor((i - 2) * 0.5) : 0;
        const armor = i >= 5 ? 1 + Math.floor((i - 5) * 0.5) : 0;
        const magic = i >= 9 ? 1 + Math.floor((i - 9) * 0.5) : 0; // Starts wave 10 (index 9)
        
        let spawnRate;
        if (i < 5) { // For waves 1-5 (indices 0-4)
            spawnRate = 5000 - i * 45;
        } else { // For wave 6+ (index 5+), they spawn faster
            const wave5Rate = 5000 - 4 * 45; // Rate at the end of wave 5
            spawnRate = wave5Rate - ((i - 4) * 150); // Decrease rate is more than 3x faster
        }
        const finalSpawnRate = Math.max(500, spawnRate); // Ensure it doesn't get too fast

        waves.push({
            normal,
            fast,
            armor,
            magic,
            spawnRate: finalSpawnRate,
        });
    }
    return waves;
};

const generateBrutalWaves = (count: number) => {
    const waves = [];
    for (let i = 0; i < count; i++) {
        const waveNum = i + 1;
        const normal = 10 + Math.floor(Math.pow(waveNum, 1.8));
        const fast = 3 + Math.floor(Math.pow(waveNum, 1.6));
        const armor = waveNum >= 2 ? 2 + Math.floor(Math.pow(waveNum - 1, 1.5)) : 0;
        const magic = waveNum >= 4 ? 2 + Math.floor(Math.pow(waveNum - 3, 1.4)) : 0;
        
        const spawnRate = Math.max(300, 3000 - (i * 250));

        waves.push({
            normal,
            fast,
            armor,
            magic,
            spawnRate,
        });
    }
    return waves;
};

// --- INITIAL STATE ---
const initialState: GameState = {
  gameStatus: 'MENU',
  plants: [],
  runnerPlants: [],
  zombies: [],
  projectiles: [],
  magicBalls: [],
  suns: INITIAL_SUNS,
  sunsToCollect: [],
  explosions: [],
  hitSplats: [],
  selectedPlant: null,
  cooldowns: {
    PEASHOOTER: 0,
    SUNFLOWER: 0,
    POTATOMINE: 0,
    CHERRYBOMB: 0,
    REPEATER: 0,
    CUCUMBER: 0,
    EGGPLANT: 0,
    STRAWBERRY: 0,
    WEED: 0,
  },
  nextIds: { plant: 0, zombie: 0, projectile: 0, sun: 0, explosion: 0, hitSplat: 0, magicBall: 0, runnerPlant: 0 },
  preparationTimeLeft: 0,
  chosenPlants: [],
  challenge: null,
  // Wave state
  waves: [],
  currentWave: 0,
  totalZombiesInWave: 0,
  zombieSpawnList: [],
  zombieSpawnRate: 6000,
  waveAnnouncement: null,
};

// --- REDUCER ---
const gameReducer = (state: GameState, action: GameAction): GameState => {
  if ((state.gameStatus === 'GAME_OVER' || state.gameStatus === 'VICTORY') && action.type !== 'RESTART_GAME') return state;
  if (state.gameStatus === 'MENU' && action.type !== 'START_PLANT_SELECTION' && action.type !== 'START_CHALLENGE_SELECTION') return state;
  if (state.gameStatus === 'PAUSED' && action.type !== 'RESUME_GAME' && action.type !== 'RESTART_GAME') return state;


  switch (action.type) {
    case 'START_PLANT_SELECTION':
      return { 
        ...initialState, 
        gameStatus: 'PLANT_SELECTION',
        waves: generateNormalWaves(100),
      };
    case 'START_CHALLENGE_SELECTION':
      return {
        ...state,
        gameStatus: 'CHALLENGE_SELECTION',
      };
    case 'BACK_TO_MENU':
      return {
        ...initialState,
        gameStatus: 'MENU',
      };
    case 'START_CHALLENGE': {
      let challengeWaves = [];
      if (action.payload.type === 'BRUTAL') {
          challengeWaves = generateBrutalWaves(action.payload.waves);
      } else {
          challengeWaves = generateNormalWaves(action.payload.waves);
      }
      return {
        ...initialState,
        gameStatus: 'PLANT_SELECTION',
        challenge: action.payload,
        waves: challengeWaves,
      };
    }
    case 'CONFIRM_PLANT_SELECTION': {
      const isBrutal = state.challenge?.type === 'BRUTAL';
      const prepTime = isBrutal ? 180000 : PREPARATION_TIME; // 3 minutes for Brutal

      return {
        ...state,
        gameStatus: 'PLAYING',
        chosenPlants: action.payload,
        waveAnnouncement: null,
        preparationTimeLeft: prepTime,
      };
    }
    case 'RESTART_GAME': {
      let restartWaves = [];
      if (state.challenge) {
          if (state.challenge.type === 'BRUTAL') {
              restartWaves = generateBrutalWaves(state.challenge.waves);
          } else {
              restartWaves = generateNormalWaves(state.challenge.waves);
          }
      } else {
          restartWaves = generateNormalWaves(100);
      }
      return { 
        ...initialState, 
        gameStatus: 'PLANT_SELECTION',
        challenge: state.challenge,
        waves: restartWaves,
      };
    }
    
    case 'PAUSE_GAME':
      if (state.gameStatus === 'PLAYING') {
        return { ...state, gameStatus: 'PAUSED' };
      }
      return state;
    case 'RESUME_GAME':
      if (state.gameStatus === 'PAUSED') {
        return { ...state, gameStatus: 'PLAYING' };
      }
      return state;

    case 'SELECT_PLANT': {
      const { cost } = plantData[action.payload];
      const isOnCooldown = state.cooldowns[action.payload] > 0;
      if (state.suns >= cost && !isOnCooldown) {
          return { ...state, selectedPlant: action.payload };
      }
      return state;
    }

    case 'PLACE_PLANT': {
      if (!state.selectedPlant) return state;
      const { row, col } = action.payload;
      if (state.plants.some(p => p.row === row && p.col === col)) return state;

      const { cost, cooldown } = plantData[state.selectedPlant];
      if (state.suns < cost) return state;
      
      // Handle Cherry Bomb separately as it's an instant effect
      if (state.selectedPlant === 'CHERRYBOMB') {
          const zombiesToRemove = new Set<number>();
          const blastRows = [row - 1, row, row + 1];
          const blastCols = [col - 1, col, col + 1];

          state.zombies.forEach(zombie => {
              const zombieCellCol = Math.floor((zombie.x + ZOMBIE_HIT_WIDTH / 2) / CELL_SIZE);
              if (blastRows.includes(zombie.row) && blastCols.includes(zombieCellCol)) {
                  zombiesToRemove.add(zombie.id);
              }
          });
          
          const newExplosion: Explosion = {
              id: state.nextIds.explosion,
              row: row,
              col: col,
              ttl: EXPLOSION_DURATION,
              isLarge: true,
          };

          return {
              ...state,
              suns: state.suns - cost,
              selectedPlant: null,
              cooldowns: {
                  ...state.cooldowns,
                  [state.selectedPlant]: cooldown,
              },
              zombies: state.zombies.filter(z => !zombiesToRemove.has(z.id)),
              explosions: [...state.explosions, newExplosion],
              nextIds: { ...state.nextIds, explosion: state.nextIds.explosion + 1 },
          };
      }
      
      // Handle Eggplant separately as it's a mobile plant
      if (state.selectedPlant === 'EGGPLANT') {
        const newRunner: RunnerPlant = {
            id: state.nextIds.runnerPlant,
            row,
            x: col * CELL_SIZE,
            type: 'EGGPLANT',
        };
        return {
            ...state,
            suns: state.suns - cost,
            runnerPlants: [...state.runnerPlants, newRunner],
            selectedPlant: null,
            cooldowns: {
                ...state.cooldowns,
                [state.selectedPlant]: cooldown,
            },
            nextIds: { ...state.nextIds, runnerPlant: state.nextIds.runnerPlant + 1 },
        };
      }

      const newPlant: Plant = {
        id: state.nextIds.plant,
        row,
        col,
        type: state.selectedPlant,
        ...(state.selectedPlant === 'POTATOMINE' && { armTime: POTATOMINE_ARM_TIME }),
        ...(state.selectedPlant === 'CUCUMBER' && { attackCooldown: 0, isAttacking: false, attackAnimationTimer: 0 }),
        ...(state.selectedPlant === 'STRAWBERRY' && { isSleeping: false, sleepTimer: 0 }),
      };

      return {
        ...state,
        suns: state.suns - cost,
        plants: [...state.plants, newPlant],
        selectedPlant: null,
        cooldowns: {
            ...state.cooldowns,
            [state.selectedPlant]: cooldown,
        },
        nextIds: { ...state.nextIds, plant: state.nextIds.plant + 1 },
      };
    }
    
    case 'START_WAVE': {
        const waveConfig = state.waves[state.currentWave];
        if (!waveConfig) return state;

        const spawnList: ZombieType[] = [];
        for (let i = 0; i < waveConfig.normal; i++) spawnList.push('NORMAL');
        for (let i = 0; i < (waveConfig.fast || 0); i++) spawnList.push('FAST');
        for (let i = 0; i < (waveConfig.armor || 0); i++) spawnList.push('ARMOR');
        for (let i = 0; i < (waveConfig.magic || 0); i++) spawnList.push('MAGIC');
        
        // Shuffle the list for random spawn order
        for (let i = spawnList.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [spawnList[i], spawnList[j]] = [spawnList[j], spawnList[i]];
        }

        return {
            ...state,
            waveAnnouncement: null, // End transition period
            totalZombiesInWave: spawnList.length,
            zombieSpawnList: spawnList,
            zombieSpawnRate: waveConfig.spawnRate,
        };
    }

    case 'SPAWN_ZOMBIE': {
        if (state.zombieSpawnList.length === 0) return state;
  
        const isBrutal = state.challenge?.type === 'BRUTAL';
        
        // In Brutal mode, spawn 3-4 zombies.
        // Otherwise, after wave 6 (index 5), spawn 2-3 zombies.
        // For wave 6 (index 5), spawn two. Before that, spawn one.
        const zombiesToSpawnCount = isBrutal
          ? (Math.random() < 0.5 ? 4 : 3)
          : state.currentWave > 5
          ? (Math.random() < 0.35 ? 3 : 2)
          : state.currentWave >= 5 ? 2 : 1;

        const zombiesToCreate = state.zombieSpawnList.slice(0, zombiesToSpawnCount);
        const remainingSpawnList = state.zombieSpawnList.slice(zombiesToSpawnCount);
  
        if (zombiesToCreate.length === 0) return state;
        
        const newZombies: Zombie[] = [];
        let currentZombieId = state.nextIds.zombie;
        
        // To prevent spawning multiple zombies in the same row in the same tick
        const availableRows = Array.from({length: GRID_ROWS}, (_, i) => i);
        
        for (const zombieType of zombiesToCreate) {
          const stats = zombieData[zombieType];
          
          if (availableRows.length === 0) break; // Should not happen with GRID_ROWS=5 and max spawn count = 4
          
          const rowIndex = Math.floor(Math.random() * availableRows.length);
          const row = availableRows.splice(rowIndex, 1)[0];
  
          const newZombie: Zombie = {
              id: currentZombieId++,
              row,
              x: GRID_COLS * CELL_SIZE,
              health: stats.health,
              type: zombieType,
          };
          if (zombieType === 'MAGIC') {
              newZombie.attackCooldown = MAGIC_BALL_FIRE_RATE;
          }
          newZombies.push(newZombie);
        }
  
        return {
          ...state,
          zombies: [...state.zombies, ...newZombies],
          zombieSpawnList: remainingSpawnList,
          nextIds: { ...state.nextIds, zombie: currentZombieId },
        };
      }

    case 'SPAWN_NATURAL_SUN': {
        const x = Math.random() * (GRID_COLS * CELL_SIZE - 60);
        const targetY = Math.random() * (GRID_ROWS * CELL_SIZE - 60);
        const newSun: Sun = { id: state.nextIds.sun, x, y: -60, isFalling: true, targetY };
        return {
            ...state,
            sunsToCollect: [...state.sunsToCollect, newSun],
            nextIds: {...state.nextIds, sun: state.nextIds.sun + 1},
        };
    }
    
    case 'SUNFLOWERS_PRODUCE_SUN': {
        const newSuns: Sun[] = [];
        let currentSunId = state.nextIds.sun;
        state.plants.forEach(plant => {
            if (plant.type === 'SUNFLOWER') {
                newSuns.push({
                    id: currentSunId++,
                    x: plant.col * CELL_SIZE + (Math.random() * 20 - 10),
                    y: plant.row * CELL_SIZE + (Math.random() * 20 - 10),
                    isFalling: false,
                    targetY: 0,
                });
            }
        });
        return {
            ...state,
            sunsToCollect: [...state.sunsToCollect, ...newSuns],
            nextIds: {...state.nextIds, sun: currentSunId},
        };
    }
    
    case 'COLLECT_SUN': {
        return {
            ...state,
            suns: Math.min(MAX_SUNS, state.suns + SUN_VALUE),
            sunsToCollect: state.sunsToCollect.filter(sun => sun.id !== action.payload.id),
        };
    }

    case 'PLANTS_FIRE': {
      const newProjectiles: Projectile[] = [];
      let currentProjectileId = state.nextIds.projectile;
      state.plants.forEach(plant => {
        if (plant.type !== 'PEASHOOTER' && plant.type !== 'REPEATER') return;

        const hasZombieInRow = state.zombies.some(z => z.row === plant.row && z.x > plant.col * CELL_SIZE);
        if (hasZombieInRow) {
          if (plant.type === 'PEASHOOTER') {
              newProjectiles.push({
                id: currentProjectileId++, row: plant.row, x: (plant.col + 0.7) * CELL_SIZE,
              });
          } else if (plant.type === 'REPEATER') {
              newProjectiles.push({
                id: currentProjectileId++, row: plant.row, x: (plant.col + 0.7) * CELL_SIZE,
              });
              newProjectiles.push({
                id: currentProjectileId++, row: plant.row, x: (plant.col + 0.9) * CELL_SIZE, // Second pea
              });
          }
        }
      });
      return {
        ...state,
        projectiles: [...state.projectiles, ...newProjectiles],
        nextIds: { ...state.nextIds, projectile: currentProjectileId },
      };
    }
    
    case 'TICK': {
      // 0. Update TTL for effects
      const updatedExplosions = state.explosions
        .map(exp => ({ ...exp, ttl: exp.ttl - TICK_RATE }))
        .filter(exp => exp.ttl > 0);
      const updatedHitSplats = state.hitSplats
        .map(hs => ({ ...hs, ttl: hs.ttl - TICK_RATE }))
        .filter(hs => hs.ttl > 0);

      // 1. Move Zombies & check for game over
      let isGameOver = false;
      const movedZombies = state.zombies.map(z => {
        const speed = zombieData[z.type].speed * (z.isSlowed ? 0.75 : 1);
        const newX = z.x - speed;
        if (newX < -CELL_SIZE) isGameOver = true;
        return { ...z, x: newX };
      });

      // 2. Move Projectiles
      const movedProjectiles = state.projectiles
        .map(p => ({ ...p, x: p.x + PEA_SPEED }))
        .filter(p => p.x < GRID_COLS * CELL_SIZE);

      // 2.5 Move Magic Balls
      const movedMagicBalls = state.magicBalls
        .map(mb => ({ ...mb, x: mb.x - MAGIC_BALL_SPEED }))
        .filter(mb => mb.x > -CELL_SIZE);
        
      // 3. Arm Potato Mines & Tick Plant Timers
      let currentPlants = state.plants.map(p => {
        let updatedPlant = { ...p };
        if (p.type === 'POTATOMINE' && p.armTime > 0) {
          updatedPlant.armTime = Math.max(0, p.armTime - TICK_RATE);
        }
        if (p.type === 'CUCUMBER') {
            if (p.attackCooldown > 0) {
                updatedPlant.attackCooldown = Math.max(0, p.attackCooldown - TICK_RATE);
            }
            if (p.attackAnimationTimer > 0) {
                updatedPlant.attackAnimationTimer = Math.max(0, p.attackAnimationTimer - TICK_RATE);
            }
            updatedPlant.isAttacking = updatedPlant.attackAnimationTimer > 0;
        }
        if (p.type === 'STRAWBERRY' && p.isSleeping && p.sleepTimer > 0) {
            updatedPlant.sleepTimer = Math.max(0, p.sleepTimer - TICK_RATE);
            if (updatedPlant.sleepTimer <= 0) {
                updatedPlant.isSleeping = false;
            }
        }
        return updatedPlant;
      });

      // 3.5 Tick Zombie Timers
      const zombiesWithTickedTimers = movedZombies.map(z => {
        if (z.type === 'MAGIC' && z.attackCooldown > 0) {
            return { ...z, attackCooldown: Math.max(0, z.attackCooldown - TICK_RATE) };
        }
        return z;
      });

      // 4. Melee Attacks (Cucumbers)
      let zombiesAfterMelee = [...zombiesWithTickedTimers];
      let plantsAfterMelee = [...currentPlants];
      const newHitSplats: HitSplat[] = [];
      let nextHitSplatId = state.nextIds.hitSplat;

      for (let i = 0; i < plantsAfterMelee.length; i++) {
          const plant = plantsAfterMelee[i];
          if (plant.type === 'CUCUMBER' && plant.attackCooldown <= 0) {
              const zombieTargetIndex = zombiesAfterMelee.findIndex(z =>
                  z.row === plant.row &&
                  z.x < (plant.col + 2) * CELL_SIZE &&
                  z.x + ZOMBIE_HIT_WIDTH > (plant.col + 1) * CELL_SIZE
              );

              if (zombieTargetIndex !== -1) {
                  const zombieToHit = zombiesAfterMelee[zombieTargetIndex];
                  zombiesAfterMelee[zombieTargetIndex] = { ...zombieToHit, health: zombieToHit.health - 1 };

                  plantsAfterMelee[i] = { ...plant, attackCooldown: CUCUMBER_ATTACK_RATE, isAttacking: true, attackAnimationTimer: 200 };
                  
                  newHitSplats.push({
                    id: nextHitSplatId++,
                    row: plant.row,
                    x: zombieToHit.x + (ZOMBIE_HIT_WIDTH / 2),
                    ttl: 150
                  });
              }
          }
      }

      // 4.5. Magic Zombie Firing
      const newMagicBalls: MagicBall[] = [];
      let nextMagicBallId = state.nextIds.magicBall;
      zombiesAfterMelee = zombiesAfterMelee.map(z => {
          if (z.type === 'MAGIC' && z.attackCooldown <= 0 && state.plants.some(p => p.row === z.row)) {
              newMagicBalls.push({ id: nextMagicBallId++, row: z.row, x: z.x });
              return { ...z, attackCooldown: MAGIC_BALL_FIRE_RATE };
          }
          return z;
      });

      // 4.75 Runner Plant (Eggplant) Movement & Collision
      const movedRunnerPlants = state.runnerPlants
        .map(rp => ({ ...rp, x: rp.x + EGGPLANT_SPEED }))
        .filter(rp => rp.x < GRID_COLS * CELL_SIZE);

      let zombiesAfterEggplantHits = [...zombiesAfterMelee];
      const runnersToRemove = new Set<number>();

      movedRunnerPlants.forEach(runner => {
        if (runnersToRemove.has(runner.id)) return;

        const zombieHitIndex = zombiesAfterEggplantHits.findIndex(z =>
            z.health > 0 &&
            z.row === runner.row &&
            (runner.x + (CELL_SIZE * 0.8)) >= z.x &&
            runner.x <= (z.x + ZOMBIE_HIT_WIDTH)
        );

        if (zombieHitIndex !== -1) {
            runnersToRemove.add(runner.id);
            const hitZombie = zombiesAfterEggplantHits[zombieHitIndex];
            zombiesAfterEggplantHits[zombieHitIndex] = {
                ...hitZombie,
                health: hitZombie.health - EGGPLANT_DAMAGE
            };
            newHitSplats.push({
                id: nextHitSplatId++,
                row: runner.row,
                x: hitZombie.x + (ZOMBIE_HIT_WIDTH / 2),
                ttl: 150
            });
        }
      });
      const remainingRunnerPlants = movedRunnerPlants.filter(rp => !runnersToRemove.has(rp.id));
      
      // 5. Weed Collision
      let zombiesAfterWeed = [...zombiesAfterEggplantHits];
      const plantsAfterWeed = [...plantsAfterMelee]; // Pass plants through, unchanged for the next step.

      zombiesAfterWeed = zombiesAfterWeed.map(zombie => {
          if (zombie.isSlowed) return zombie;

          const zombieCellCol = Math.floor((zombie.x + ZOMBIE_HIT_WIDTH / 2) / CELL_SIZE);
          const hasWeedOnTile = plantsAfterWeed.some(plant => 
              plant.type === 'WEED' &&
              plant.row === zombie.row && 
              plant.col === zombieCellCol
          );

          if (hasWeedOnTile) {
              return { ...zombie, isSlowed: true };
          }
          return zombie;
      });
      // No need to filter plantsAfterWeed, as weeds are not removed.


      // 5. Potato Mine Explosions
      let zombiesAfterExplosions = [...zombiesAfterWeed];
      let plantsAfterExplosions = [...plantsAfterWeed];
      const plantsToRemove = new Set<number>();
      const zombiesToRemove = new Set<number>();
      const newExplosionsThisTick: Explosion[] = [];
      let nextExplosionId = state.nextIds.explosion;
      
      const armedMines = plantsAfterExplosions.filter(p => p.type === 'POTATOMINE' && p.armTime <= 0);
      const availableMines = [...armedMines];

      zombiesAfterExplosions.forEach(zombie => {
        const zombieCellCol = Math.floor((zombie.x + ZOMBIE_HIT_WIDTH / 2) / CELL_SIZE);
        const mineIndex = availableMines.findIndex(mine => mine.row === zombie.row && mine.col === zombieCellCol);

        if (mineIndex !== -1) {
          const explodingMine = availableMines[mineIndex];
          zombiesToRemove.add(zombie.id);
          plantsToRemove.add(explodingMine.id);
          newExplosionsThisTick.push({
            id: nextExplosionId++,
            row: explodingMine.row,
            col: explodingMine.col,
            ttl: EXPLOSION_DURATION,
            isLarge: false,
          });
          availableMines.splice(mineIndex, 1); // Mine is used up
        }
      });
      
      zombiesAfterExplosions = zombiesAfterExplosions.filter(z => !zombiesToRemove.has(z.id));
      plantsAfterExplosions = plantsAfterExplosions.filter(p => !plantsToRemove.has(p.id));

      // 5.5 Strawberry Explosions
      for (let i = 0; i < plantsAfterExplosions.length; i++) {
        const plant = plantsAfterExplosions[i];
        if (plant.type === 'STRAWBERRY' && !plant.isSleeping) {
            const blastRows = [plant.row - 1, plant.row, plant.row + 1];
            const blastCols = [plant.col - 1, plant.col, plant.col + 1];
    
            const isZombieNearby = zombiesAfterExplosions.some(zombie => {
                const zombieCellCol = Math.floor((zombie.x + ZOMBIE_HIT_WIDTH / 2) / CELL_SIZE);
                return blastRows.includes(zombie.row) && blastCols.includes(zombieCellCol);
            });
    
            if (isZombieNearby) {
                // Explode
                plantsAfterExplosions[i] = {
                    ...plant,
                    isSleeping: true,
                    sleepTimer: STRAWBERRY_SLEEP_TIME
                };
    
                newExplosionsThisTick.push({
                    id: nextExplosionId++,
                    row: plant.row,
                    col: plant.col,
                    ttl: EXPLOSION_DURATION,
                    isLarge: false,
                });
    
                zombiesAfterExplosions = zombiesAfterExplosions.map(zombie => {
                    const zombieCellCol = Math.floor((zombie.x + ZOMBIE_HIT_WIDTH / 2) / CELL_SIZE);
                    if (blastRows.includes(zombie.row) && blastCols.includes(zombieCellCol)) {
                        return { ...zombie, health: zombie.health - STRAWBERRY_DAMAGE };
                    }
                    return zombie;
                });
            }
        }
      }

      // 6. Projectile Collision Detection
      let zombiesAfterHit = [...zombiesAfterExplosions];
      const projectilesToRemove = new Set<number>();

      movedProjectiles.forEach(p => {
        if (projectilesToRemove.has(p.id)) return;
        const zombieHitIndex = zombiesAfterHit.findIndex(z =>
            z.health > 0 && z.row === p.row &&
            p.x + PEA_HIT_WIDTH >= z.x && p.x < z.x + ZOMBIE_HIT_WIDTH
        );
        if (zombieHitIndex !== -1) {
          projectilesToRemove.add(p.id);
          zombiesAfterHit[zombieHitIndex] = {
            ...zombiesAfterHit[zombieHitIndex],
            health: zombiesAfterHit[zombieHitIndex].health - 1
          };
        }
      });
      
      const remainingProjectiles = movedProjectiles.filter(p => !projectilesToRemove.has(p.id));
      
      // 6.5 Magic Ball Collision
      const plantsToRemoveFromMagicHits = new Set<number>();
      const magicBallsToRemove = new Set<number>();
      let finalPlants = [...plantsAfterExplosions];
      
      movedMagicBalls.forEach(mb => {
        if(magicBallsToRemove.has(mb.id)) return;
        const plantHitIndex = finalPlants.findIndex(p =>
            p.row === mb.row &&
            mb.x <= (p.col + 1) * CELL_SIZE &&
            mb.x >= p.col * CELL_SIZE
        );
        if (plantHitIndex !== -1) {
            magicBallsToRemove.add(mb.id);
            plantsToRemoveFromMagicHits.add(finalPlants[plantHitIndex].id);
        }
      });

      finalPlants = finalPlants.filter(p => !plantsToRemoveFromMagicHits.has(p.id));
      const remainingMagicBalls = movedMagicBalls.filter(mb => !magicBallsToRemove.has(mb.id));

      const remainingZombies = zombiesAfterHit.filter(z => z.health > 0);
      
      // 7. Move Falling Suns
      const movedSuns = state.sunsToCollect.map(sun => {
        if (sun.isFalling && sun.y < sun.targetY) {
            return {...sun, y: sun.y + SUN_FALL_SPEED };
        }
        return sun;
      });

      // 8. Update Cooldowns
      const newCooldowns = { ...state.cooldowns };
      for (const plantType in newCooldowns) {
          if (newCooldowns[plantType as PlantType] > 0) {
            newCooldowns[plantType as PlantType] = Math.max(0, newCooldowns[plantType as PlantType] - TICK_RATE);
          }
      }

      // 9. Check for Wave Completion
      const waveIsActive = state.totalZombiesInWave > 0;
      const allZombiesSpawned = state.zombieSpawnList.length === 0;
      const allZombiesCleared = remainingZombies.length === 0;

      if (waveIsActive && allZombiesSpawned && allZombiesCleared) {
          if (state.currentWave >= state.waves.length - 1) { // wave is 0-indexed
              return { ...state, gameStatus: 'VICTORY' }; // Final wave cleared
          } else {
              // Prepare for the next wave
              const nextWave = state.currentWave + 1;
              return {
                  ...state,
                  plants: finalPlants,
                  runnerPlants: remainingRunnerPlants,
                  zombies: remainingZombies,
                  projectiles: remainingProjectiles,
                  magicBalls: [...remainingMagicBalls, ...newMagicBalls],
                  sunsToCollect: movedSuns,
                  explosions: [...updatedExplosions, ...newExplosionsThisTick],
                  hitSplats: [...updatedHitSplats, ...newHitSplats],
                  cooldowns: newCooldowns,
                  currentWave: nextWave,
                  waveAnnouncement: `Get ready for Wave ${nextWave + 1}!`,
                  totalZombiesInWave: 0, // Mark wave as inactive until started
              };
          }
      }
      
      // 10. Handle Preparation Time
      let newPreparationTimeLeft = state.preparationTimeLeft;
      let newWaveAnnouncement = state.waveAnnouncement;
      
      if (state.preparationTimeLeft > 0) {
          newPreparationTimeLeft = Math.max(0, state.preparationTimeLeft - TICK_RATE);
          if (newPreparationTimeLeft === 0) {
              newWaveAnnouncement = `Get ready for Wave ${state.currentWave + 1}!`;
          }
      }

      return {
        ...state,
        plants: finalPlants,
        runnerPlants: remainingRunnerPlants,
        zombies: remainingZombies,
        projectiles: remainingProjectiles,
        magicBalls: [...remainingMagicBalls, ...newMagicBalls],
        sunsToCollect: movedSuns,
        explosions: [...updatedExplosions, ...newExplosionsThisTick],
        hitSplats: [...updatedHitSplats, ...newHitSplats],
        cooldowns: newCooldowns,
        gameStatus: isGameOver ? 'GAME_OVER' : state.gameStatus,
        nextIds: { ...state.nextIds, explosion: nextExplosionId, hitSplat: nextHitSplatId, magicBall: nextMagicBallId },
        preparationTimeLeft: newPreparationTimeLeft,
        waveAnnouncement: newWaveAnnouncement,
      };
    }
    default:
      return state;
  }
};

// --- COMPONENTS ---

const MainMenu = ({ onStart, onStartChallenges }: { onStart: () => void; onStartChallenges: () => void }) => (
  <div className="main-menu">
    <h1>Plants vs. Zombies Lite</h1>
    <p>Your goal is to protect your house from the zombies!</p>
    <div className="main-menu-buttons">
        <button onClick={onStart}>Start Game</button>
        <button onClick={onStartChallenges}>Challenges</button>
    </div>
  </div>
);

const ChallengeMenu = ({ onSelectChallenge, onBack }: {
    onSelectChallenge: (challenge: NonNullable<Challenge>) => void;
    onBack: () => void;
}) => {
    const challenges: NonNullable<Challenge>[] = [
        { type: 'NO_SUNFLOWER', waves: 25 },
        { type: 'BOOM', waves: 25 },
        { type: 'BRUTAL', waves: 10 },
    ];

    return (
        <div className="challenge-menu-screen">
            <h2>Challenges</h2>
            <div className="challenge-list">
                {challenges.map(challenge => {
                    let title = '';
                    let description = '';

                    switch (challenge.type) {
                        case 'NO_SUNFLOWER':
                            title = 'No Sunflowers';
                            description = `Survive ${challenge.waves} waves without the help of Sunflowers. Good luck!`;
                            break;
                        case 'BOOM':
                            title = 'BOOM!';
                            description = `Survive ${challenge.waves} waves using only Potatomine, Cherry Bomb, Strawberry, and Sunflower.`;
                            break;
                        case 'BRUTAL':
                            title = 'Brutal';
                            description = `Survive ${challenge.waves} incredibly difficult waves. Not for the faint of heart.`;
                            break;
                    }

                    return (
                        <div key={challenge.type} className="challenge-card" onClick={() => onSelectChallenge(challenge)} role="button">
                            <h3 className="challenge-title">{title}</h3>
                            <p className="challenge-description">{description}</p>
                        </div>
                    );
                })}
            </div>
            <button onClick={onBack}>Back to Menu</button>
        </div>
    );
};

const GameOver = ({ onRestart }: { onRestart: () => void }) => (
  <div className="game-over">
    <h2>GAME OVER</h2>
    <button onClick={onRestart}>Play Again</button>
  </div>
);

const Victory = ({ onRestart }: { onRestart: () => void }) => (
  <div className="victory-screen">
    <h2>You Survived!</h2>
    <p>You protected your home from the zombie horde!</p>
    <button onClick={onRestart}>Play Again</button>
  </div>
);

const PausedScreen = ({ onResume, onRestart }: { onResume: () => void; onRestart: () => void; }) => (
    <div className="paused-screen">
        <h2>PAUSED</h2>
        <div className="paused-screen-buttons">
            <button onClick={onResume}>Resume</button>
            <button onClick={onRestart}>Restart</button>
        </div>
    </div>
);

const getPlantEmoji = (plantType: PlantType) => {
    switch(plantType) {
        case 'PEASHOOTER': return '🫛';
        case 'SUNFLOWER': return '🌻';
        case 'POTATOMINE': return '🥔';
        case 'CHERRYBOMB': return '🍒';
        case 'REPEATER': return '🌿';
        case 'CUCUMBER': return '🥒';
        case 'EGGPLANT': return '🍆';
        case 'STRAWBERRY': return '🍓';
        case 'WEED': return '🌱';
        default: return '';
    }
};

const PlantCard = ({ plantType, onSelect, suns, selectedPlant, cooldown, totalCooldown }: { 
    plantType: PlantType; 
    onSelect: () => void; 
    suns: number; 
    selectedPlant: PlantType | null; 
    cooldown: number;
    totalCooldown: number;
}) => {
    const { cost } = plantData[plantType];
    const canAfford = suns >= cost;
    const isOnCooldown = cooldown > 0;
    const isDisabled = !canAfford || isOnCooldown;
    const isSelected = selectedPlant === plantType;
    const cooldownPercentage = (cooldown / totalCooldown) * 100;
    
    const plantEmoji = getPlantEmoji(plantType);

    return (
        <div 
            className={`plant-card ${isDisabled ? 'disabled' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={!isDisabled ? onSelect : undefined}
            role="button"
            aria-disabled={isDisabled}
            aria-label={`Select ${plantType}`}
        >
            {isOnCooldown && (
                <div className="cooldown-overlay" style={{ height: `${cooldownPercentage}%`}}></div>
            )}
            <span className="plant-card-emoji">{plantEmoji}</span>
            <span className="plant-card-cost">{cost}</span>
        </div>
    );
};

const PlantSelectionScreen = ({ onConfirm, challenge }: { onConfirm: (plants: PlantType[]) => void; challenge: Challenge; }) => {
    const allPlants: PlantType[] = ['SUNFLOWER', 'PEASHOOTER', 'REPEATER', 'POTATOMINE', 'CHERRYBOMB', 'CUCUMBER', 'EGGPLANT', 'STRAWBERRY', 'WEED'];
    
    let availablePlants: PlantType[];
    switch (challenge?.type) {
        case 'NO_SUNFLOWER':
            availablePlants = allPlants.filter(p => p !== 'SUNFLOWER');
            break;
        case 'BOOM':
            availablePlants = ['POTATOMINE', 'CHERRYBOMB', 'STRAWBERRY', 'SUNFLOWER'];
            break;
        default:
            availablePlants = allPlants;
    }
    
    const [chosenPlants, setChosenPlants] = useState<PlantType[]>([]);

    const togglePlant = (plant: PlantType) => {
        setChosenPlants(current => {
            if (current.includes(plant)) {
                return current.filter(p => p !== plant);
            } else {
                if (current.length < 4) {
                    return [...current, plant];
                }
                return current;
            }
        });
    };

    return (
        <div className="plant-selection-screen">
            <h2>Choose Your Plants</h2>
            <h3>Your Deck ({chosenPlants.length}/4)</h3>
            <div className="plant-selection-slots">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="plant-slot">
                        {chosenPlants[i] && (
                             <div className="plant-card" onClick={() => togglePlant(chosenPlants[i])}>
                                 <span className="plant-card-emoji">{getPlantEmoji(chosenPlants[i])}</span>
                                 <span className="plant-card-cost">{plantData[chosenPlants[i]].cost}</span>
                             </div>
                        )}
                    </div>
                ))}
            </div>

            <h3>Available Plants</h3>
            <div className="plant-selection-grid">
                {availablePlants.map(pType => {
                    const isChosen = chosenPlants.includes(pType);
                    const isFull = chosenPlants.length >= 4;
                    const canSelect = !isFull || isChosen;

                    return (
                        <div key={pType} className={`plant-card-wrapper ${isChosen ? 'chosen' : ''} ${isFull && !isChosen ? 'unselectable' : ''}`} onClick={canSelect ? () => togglePlant(pType) : undefined}>
                            <span className="plant-card-emoji">{getPlantEmoji(pType)}</span>
                            <span className="plant-card-cost">{plantData[pType].cost}</span>
                        </div>
                    );
                })}
            </div>

            <button disabled={chosenPlants.length !== 4} onClick={() => onConfirm(chosenPlants)}>
                Let's Rock!
            </button>
        </div>
    );
};


const WaveProgressBar = ({ totalZombies, zombiesOnScreen, zombiesToSpawn }: {
    totalZombies: number;
    zombiesOnScreen: number;
    zombiesToSpawn: number;
}) => {
    if (totalZombies === 0) return null;

    const zombiesSpawned = totalZombies - zombiesToSpawn;
    const zombiesDefeated = zombiesSpawned - zombiesOnScreen;

    const fillPercent = totalZombies > 0 ? (zombiesDefeated / totalZombies) * 100 : 0;
    const headPercent = totalZombies > 0 ? (zombiesSpawned / totalZombies) * 100 : 0;

    const showHead = (zombiesOnScreen + zombiesToSpawn) > 0;

    return (
        <div className="wave-progress-container">
            <div className="wave-progress-bar">
                <div className="wave-progress-fill" style={{ width: `${fillPercent}%` }}></div>
                {showHead && (
                    <div className="wave-progress-icon zombie-head" style={{ left: `clamp(0%, ${headPercent}%, 96%)` }}>🧟</div>
                )}
                <div className="wave-progress-icon flag">🚩</div>
            </div>
        </div>
    );
};


const App = () => {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const { gameStatus, plants, zombies, projectiles, magicBalls, suns, sunsToCollect, explosions, hitSplats, selectedPlant, cooldowns, waveAnnouncement, preparationTimeLeft } = state;

  // Main game timers
  useEffect(() => {
    if (gameStatus !== 'PLAYING') return;

    const tickTimer = setInterval(() => dispatch({ type: 'TICK' }), TICK_RATE);
    const fireTimer = setInterval(() => dispatch({ type: 'PLANTS_FIRE' }), PLANT_FIRE_RATE);
    const sunTimer = setInterval(() => dispatch({ type: 'SPAWN_NATURAL_SUN' }), NATURAL_SUN_SPAWN_RATE);
    const sunflowerTimer = setInterval(() => dispatch({ type: 'SUNFLOWERS_PRODUCE_SUN'}), SUNFLOWER_PRODUCE_RATE);

    return () => {
      clearInterval(tickTimer);
      clearInterval(fireTimer);
      clearInterval(sunTimer);
      clearInterval(sunflowerTimer);
    };
  }, [gameStatus]);

  // Wave and spawning timers
  useEffect(() => {
    if (gameStatus !== 'PLAYING') return;

    // Handle wave transitions. An announcement indicates a transition period.
    if (state.waveAnnouncement) {
        const transitionTimer = setTimeout(() => {
            dispatch({ type: 'START_WAVE' });
        }, WAVE_TRANSITION_DELAY);
        return () => clearTimeout(transitionTimer);
    }

    // Handle zombie spawning when a wave is active
    if (state.zombieSpawnList.length > 0) {
        const spawnTimer = setInterval(() => {
            dispatch({ type: 'SPAWN_ZOMBIE' });
        }, state.zombieSpawnRate);
        return () => clearInterval(spawnTimer);
    }
  }, [gameStatus, state.waveAnnouncement, state.zombieSpawnList, state.zombieSpawnRate]);


  const handleCellClick = useCallback((row: number, col: number) => {
      if (selectedPlant) {
          dispatch({ type: 'PLACE_PLANT', payload: { row, col } });
      }
  }, [selectedPlant]);

  const getPlantClass = (plant: Plant) => {
    let classes = 'plant';
    if (plant.type === 'SUNFLOWER') classes += ' sunflower';
    if (plant.type === 'POTATOMINE') {
        classes += ' potatomine';
        if (plant.armTime <= 0) classes += ' armed';
    }
    if (plant.type === 'CUCUMBER' && plant.isAttacking) {
        classes += ' attacking';
    }
    if (plant.type === 'STRAWBERRY' && plant.isSleeping) {
        classes += ' sleeping';
    }
    return classes;
  };
  
  const isPreparing = preparationTimeLeft > 0;
  const announcementMessage = isPreparing 
    ? `Zombies are coming in ${Math.ceil(preparationTimeLeft / 1000)}...`
    : waveAnnouncement;


  if (gameStatus === 'MENU') {
    return <MainMenu 
        onStart={() => dispatch({ type: 'START_PLANT_SELECTION' })}
        onStartChallenges={() => dispatch({ type: 'START_CHALLENGE_SELECTION' })}
    />;
  }
  
  if (gameStatus === 'CHALLENGE_SELECTION') {
      return <ChallengeMenu 
        onSelectChallenge={(challenge) => dispatch({ type: 'START_CHALLENGE', payload: challenge })}
        onBack={() => dispatch({ type: 'BACK_TO_MENU' })}
      />
  }

  if (gameStatus === 'PLANT_SELECTION') {
    return <PlantSelectionScreen 
        onConfirm={(chosen) => dispatch({ type: 'CONFIRM_PLANT_SELECTION', payload: chosen })}
        challenge={state.challenge}
    />;
  }

  return (
    <div className="app-wrapper">
        <div className={`game-container ${selectedPlant ? 'plant-cursor' : ''}`}>
            <div className="game-ui">
                <div className="sun-counter">☀️ {suns}</div>
                <div className="plant-selector">
                    {state.chosenPlants.map(plantType => (
                         <PlantCard 
                            key={plantType}
                            plantType={plantType} 
                            onSelect={() => dispatch({type: 'SELECT_PLANT', payload: plantType})} 
                            suns={suns} 
                            selectedPlant={selectedPlant} 
                            cooldown={cooldowns[plantType]} 
                            totalCooldown={plantData[plantType].cooldown} 
                        />
                    ))}
                </div>
                <div className="game-controls">
                    <button className="control-button pause-button" onClick={() => dispatch({ type: 'PAUSE_GAME' })} aria-label="Pause Game" disabled={gameStatus !== 'PLAYING'}>
                        ❚❚
                    </button>
                    <button className="control-button" onClick={() => dispatch({ type: 'RESTART_GAME' })} aria-label="Restart Game">
                        Restart
                    </button>
                </div>
            </div>
            <div
                className="game-board"
                style={{ width: GRID_COLS * CELL_SIZE, height: GRID_ROWS * CELL_SIZE }}
            >
                {announcementMessage && (
                    <div className={`wave-announcement ${isPreparing ? 'preparation' : ''}`}>
                        {announcementMessage}
                    </div>
                )}
                
                {/* Render Grid Cells */}
                {Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, i) => {
                    const row = Math.floor(i / GRID_COLS);
                    const col = i % GRID_COLS;
                    return (
                        <div
                            key={`cell-${row}-${col}`}
                            className={`cell ${(row + col) % 2 === 0 ? 'cell-light' : 'cell-dark'}`}
                            style={{ width: CELL_SIZE, height: CELL_SIZE }}
                            onClick={() => handleCellClick(row, col)}
                            role="button"
                            aria-label={`Plant at row ${row + 1}, column ${col + 1}`}
                        />
                    );
                })}
                
                {/* Render Game Objects */}
                {plants.map(plant => (
                    <div key={plant.id} className={getPlantClass(plant)} style={{ top: plant.row * CELL_SIZE, left: plant.col * CELL_SIZE }}>
                        {getPlantEmoji(plant.type)}
                    </div>
                ))}
                {state.runnerPlants.map(runner => (
                    <div key={runner.id} className="plant" style={{ top: runner.row * CELL_SIZE, left: runner.x }}>
                        {getPlantEmoji(runner.type)}
                    </div>
                ))}
                {zombies.map(zombie => {
                    let zombieClass = 'zombie';
                    if (zombie.isSlowed) zombieClass += ' slowed';
                    let zombieEmoji = '🧟';
                    if (zombie.type === 'FAST') {
                        zombieClass += ' fast';
                        zombieEmoji = '🏃';
                    } else if (zombie.type === 'ARMOR') {
                        zombieClass += ' armor';
                        zombieEmoji = '💂';
                    } else if (zombie.type === 'MAGIC') {
                        zombieClass += ' magic';
                        zombieEmoji = '🧙';
                    }
                    return (
                        <div key={zombie.id} className={zombieClass} style={{ top: zombie.row * CELL_SIZE, left: zombie.x }}>
                            {zombieEmoji}
                        </div>
                    );
                })}
                {projectiles.map(p => (
                    <div key={p.id} className="pea" style={{ top: p.row * CELL_SIZE + (CELL_SIZE / 2) - 10, left: p.x }}></div>
                ))}
                {magicBalls.map(mb => (
                    <div key={mb.id} className="magic-ball" style={{ top: mb.row * CELL_SIZE + (CELL_SIZE / 2) - 15, left: mb.x }}></div>
                ))}
                {sunsToCollect.map(sun => (
                    <div 
                        key={sun.id} 
                        className="sun" 
                        style={{ top: sun.y, left: sun.x }}
                        onClick={() => dispatch({ type: 'COLLECT_SUN', payload: { id: sun.id } })}
                        role="button"
                        aria-label="Collect sun"
                    >☀️</div>
                ))}
                {explosions.map(exp => (
                    <div
                        key={exp.id}
                        className={`explosion ${exp.isLarge ? 'large' : ''}`}
                        style={{
                            top: exp.isLarge ? (exp.row - 1) * CELL_SIZE : exp.row * CELL_SIZE,
                            left: exp.isLarge ? (exp.col - 1) * CELL_SIZE : exp.col * CELL_SIZE,
                        }}
                    />
                ))}
                {hitSplats.map(hs => (
                    <div
                        key={`hitsplat-${hs.id}`}
                        className="hit-splat"
                        style={{
                            top: hs.row * CELL_SIZE + (CELL_SIZE / 2),
                            left: hs.x,
                        }}
                    />
                ))}

                {gameStatus === 'PAUSED' && <PausedScreen onResume={() => dispatch({ type: 'RESUME_GAME' })} onRestart={() => dispatch({ type: 'RESTART_GAME' })} />}
                {gameStatus === 'GAME_OVER' && <GameOver onRestart={() => dispatch({ type: 'RESTART_GAME' })} />}
                {gameStatus === 'VICTORY' && <Victory onRestart={() => dispatch({ type: 'RESTART_GAME' })} />}
            </div>
        </div>
        <WaveProgressBar 
            totalZombies={state.totalZombiesInWave} 
            zombiesOnScreen={state.zombies.length} 
            zombiesToSpawn={state.zombieSpawnList.length} 
        />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);