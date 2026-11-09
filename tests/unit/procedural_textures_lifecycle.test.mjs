import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// 1. ESM Loader hook for TypeScript imports
const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      for (const ext of ['.ts', '.js', '/index.ts', '/index.js']) {
        try {
          return await nextResolve(specifier + ext, context);
        } catch {}
      }
    }
    throw err;
  }
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`, pathToFileURL('./'));

// 2. Headless DOM Mock
const mockContext = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  fillRect: () => {},
  strokeRect: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  ellipse: () => {},
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  fill: () => {},
  stroke: () => {},
  roundRect: () => {},
  createRadialGradient: () => ({
    addColorStop: () => {},
  }),
};

if (!globalThis.document) {
  globalThis.document = {
    createElement: () => ({
      getContext: () => mockContext,
      width: 32,
      height: 32,
    }),
  };
}

const {
  generateItemTextures,
  ensureJuiceTextures,
  destroyProceduralTextures,
  ITEM_DEFS,
  PROCEDURAL_ITEM_KEYS,
  PROCEDURAL_JUICE_KEYS,
  ALL_PROCEDURAL_TEXTURE_KEYS,
} = await import('../../src/game/graphics/ProceduralTextures.ts');

/**
 * Creates a mock scene with a tracking TextureManager and Graphics tracker.
 */
function createMockScene() {
  const texturesMap = new Map();
  const createdGraphics = [];

  const textureManager = {
    exists: (key) => texturesMap.has(key),
    get: (key) => texturesMap.get(key),
    createCanvas: (key, width, height) => {
      if (texturesMap.has(key)) return null;
      let isDestroyed = false;
      const canvasTexture = {
        key,
        width,
        height,
        getContext: () => mockContext,
        refresh: () => {},
        destroy: () => {
          isDestroyed = true;
          texturesMap.delete(key);
        },
        get isDestroyed() {
          return isDestroyed;
        },
      };
      texturesMap.set(key, canvasTexture);
      return canvasTexture;
    },
    remove: (key) => {
      const tex = texturesMap.get(key);
      if (tex) {
        if (typeof tex.destroy === 'function') tex.destroy();
        texturesMap.delete(key);
      }
      return textureManager;
    },
    get size() {
      return texturesMap.size;
    },
    get keys() {
      return Array.from(texturesMap.keys());
    },
  };

  const scene = {
    textures: textureManager,
    add: {
      graphics: () => {
        let isDestroyed = false;
        const g = {
          fillStyle: () => g,
          lineStyle: () => g,
          fillRoundedRect: () => g,
          strokeRoundedRect: () => g,
          fillCircle: () => g,
          fillRect: () => g,
          fillEllipse: () => g,
          generateTexture: (key, w, h) => {
            if (!texturesMap.has(key)) {
              texturesMap.set(key, { key, w, h, isGraphics: true });
            }
            return g;
          },
          destroy: () => {
            isDestroyed = true;
          },
          get isDestroyed() {
            return isDestroyed;
          },
        };
        createdGraphics.push(g);
        return g;
      },
    },
  };

  return { scene, texturesMap, createdGraphics };
}

/* ==============================================================================
 * TEST 1: CONSTANTS AND ZERO-GC PRE-ALLOCATIONS
 * ============================================================================== */

test('ProceduralTextures: ITEM_DEFS and key lists are frozen and properly sized', () => {
  assert.equal(ITEM_DEFS.length, 24, 'Must define exactly 24 distinct items');
  assert.equal(PROCEDURAL_ITEM_KEYS.length, 24, 'Must have 24 item keys');
  assert.equal(PROCEDURAL_JUICE_KEYS.length, 4, 'Must have 4 juice keys (dust, spark, debris, shadow_ellipse)');
  assert.equal(ALL_PROCEDURAL_TEXTURE_KEYS.length, 28, 'Must have 28 total procedural texture keys');

  assert.ok(Object.isFrozen(ITEM_DEFS), 'ITEM_DEFS array must be frozen');
  assert.ok(Object.isFrozen(PROCEDURAL_ITEM_KEYS), 'PROCEDURAL_ITEM_KEYS must be frozen');
  assert.ok(Object.isFrozen(PROCEDURAL_JUICE_KEYS), 'PROCEDURAL_JUICE_KEYS must be frozen');
  assert.ok(Object.isFrozen(ALL_PROCEDURAL_TEXTURE_KEYS), 'ALL_PROCEDURAL_TEXTURE_KEYS must be frozen');
});

/* ==============================================================================
 * TEST 2: GENERATION OF ALL 28 PROCEDURAL TEXTURES
 * ============================================================================== */

test('ProceduralTextures: generateItemTextures and ensureJuiceTextures generate all 28 textures', () => {
  const { scene, texturesMap } = createMockScene();

  generateItemTextures(scene);
  assert.equal(texturesMap.size, 24, 'Must generate 24 item textures');

  for (const key of PROCEDURAL_ITEM_KEYS) {
    assert.ok(scene.textures.exists(key), `Item texture '${key}' must exist`);
  }

  ensureJuiceTextures(scene);
  assert.equal(texturesMap.size, 28, 'Must have 28 textures after juice textures generation');

  for (const key of PROCEDURAL_JUICE_KEYS) {
    assert.ok(scene.textures.exists(key), `Juice texture '${key}' must exist`);
  }
});

/* ==============================================================================
 * TEST 3: ZERO-GC IDEMPOTENCY ACROSS CONSECUTIVE SCENE RESTARTS
 * ============================================================================== */

test('ProceduralTextures: consecutive calls across 100 restarts perform 0 re-allocations', () => {
  const { scene, texturesMap } = createMockScene();

  // Initial generation
  generateItemTextures(scene);
  ensureJuiceTextures(scene);
  assert.equal(texturesMap.size, 28);

  // Snapshot original texture object references
  const initialEntries = new Map(texturesMap);

  // Simulate 100 scene restarts calling texture generation
  for (let i = 0; i < 100; i++) {
    generateItemTextures(scene);
    ensureJuiceTextures(scene);

    assert.equal(texturesMap.size, 28, `Iteration ${i}: Texture count must remain exactly 28`);
    for (const [key, tex] of initialEntries) {
      assert.strictEqual(texturesMap.get(key), tex, `Iteration ${i}: Texture reference '${key}' must be preserved`);
    }
  }
});

/* ==============================================================================
 * TEST 4: GRAPHICS DISPOSAL IN FALLBACKS AND EXCEPTIONS
 * ============================================================================== */

test('ProceduralTextures: Graphics objects are guaranteed destroyed even if texture generation throws', () => {
  const { scene, createdGraphics } = createMockScene();

  // Force canvas creation failure so it falls back to scene.add.graphics()
  scene.textures.createCanvas = () => {
    throw new Error('Simulated Canvas context allocation failure');
  };

  // Run generation
  generateItemTextures(scene);
  ensureJuiceTextures(scene);

  assert.ok(createdGraphics.length > 0, 'Graphics fallbacks must have been instantiated');
  for (let i = 0; i < createdGraphics.length; i++) {
    assert.ok(createdGraphics[i].isDestroyed, `Graphics object at index ${i} must be destroyed`);
  }
});

/* ==============================================================================
 * TEST 5: CLEANUP OF FAILED HALF-REGISTERED CANVAS TEXTURES
 * ============================================================================== */

test('ProceduralTextures: Half-registered canvas textures are removed on context failure', () => {
  const { scene, texturesMap } = createMockScene();

  // Simulate failure during canvas rendering
  let callCount = 0;
  scene.textures.createCanvas = (key, width, height) => {
    callCount++;
    const canvasTex = {
      key,
      width,
      height,
      getContext: () => {
        throw new Error('Simulated context crash');
      },
      destroy: () => {
        texturesMap.delete(key);
      },
    };
    texturesMap.set(key, canvasTex);
    return canvasTex;
  };

  generateItemTextures(scene);

  // None of the corrupted canvas textures should remain in the map
  for (const key of PROCEDURAL_ITEM_KEYS) {
    const tex = texturesMap.get(key);
    assert.ok(tex?.isGraphics, `Failed canvas texture '${key}' must have fallen back to Graphics`);
  }
});

/* ==============================================================================
 * TEST 6: COMPLETE TEARDOWN VIA destroyProceduralTextures
 * ============================================================================== */

test('ProceduralTextures: destroyProceduralTextures cleanly purges all 28 textures', () => {
  const { scene, texturesMap } = createMockScene();

  generateItemTextures(scene);
  ensureJuiceTextures(scene);
  assert.equal(texturesMap.size, 28);

  destroyProceduralTextures(scene);
  assert.equal(texturesMap.size, 0, 'All procedural textures must be destroyed and removed');

  for (const key of ALL_PROCEDURAL_TEXTURE_KEYS) {
    assert.equal(scene.textures.exists(key), false, `Texture '${key}' must no longer exist`);
  }
});
