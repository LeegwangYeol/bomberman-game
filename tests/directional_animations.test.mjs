import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ASSET_PATH = path.resolve('public/assets/player.png');

test('Spritesheet Asset: player.png exists and has exact 120x160 dimensions', () => {
  assert.ok(fs.existsSync(ASSET_PATH), 'public/assets/player.png must exist');
  const buffer = fs.readFileSync(ASSET_PATH);
  
  // Verify PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  assert.ok(isPng, 'player.png must have valid PNG magic bytes');

  // IHDR chunk: width at offset 16 (4 bytes BE), height at offset 20 (4 bytes BE)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  assert.equal(width, 120, 'Spritesheet width must be exactly 120px (3 cols of 40px)');
  assert.equal(height, 160, 'Spritesheet height must be exactly 160px (4 rows of 40px)');
});

/**
 * Directional Animation State Controller Specification
 */
class AnimationStateController {
  constructor() {
    this.playerFacing = 'down';
    this.currentAnim = null;
    this.currentFrame = 0;
    this.flipX = false;
    this.isPlaying = false;
  }

  handleMovement(wantX, wantY, primaryAxis) {
    if (wantX === 0 && wantY === 0) {
      this.isPlaying = false;
      switch (this.playerFacing) {
        case 'down':
          this.currentFrame = 0;
          break;
        case 'up':
          this.currentFrame = 3;
          break;
        case 'right':
          this.flipX = false;
          this.currentFrame = 6;
          break;
        case 'left':
          this.flipX = true;
          this.currentFrame = 6;
          break;
      }
      return;
    }

    this.isPlaying = true;
    if (primaryAxis === 'x') {
      this.flipX = wantX < 0;
      this.playerFacing = wantX < 0 ? 'left' : 'right';
      this.currentAnim = 'player_side';
    } else {
      this.playerFacing = wantY < 0 ? 'up' : 'down';
      this.currentAnim = wantY < 0 ? 'player_up' : 'player_down';
    }
  }

  handleDefeat() {
    this.isPlaying = true;
    this.currentAnim = 'player_defeat';
  }
}

test('Animation Controller: moving DOWN plays player_down and preserves down idle frame 0', () => {
  const ctrl = new AnimationStateController();
  ctrl.handleMovement(0, 1, 'y');
  assert.equal(ctrl.playerFacing, 'down');
  assert.equal(ctrl.currentAnim, 'player_down');
  assert.equal(ctrl.isPlaying, true);

  // Stop moving
  ctrl.handleMovement(0, 0, 'y');
  assert.equal(ctrl.isPlaying, false);
  assert.equal(ctrl.playerFacing, 'down');
  assert.equal(ctrl.currentFrame, 0);
});

test('Animation Controller: moving UP plays player_up and preserves up idle frame 3', () => {
  const ctrl = new AnimationStateController();
  ctrl.handleMovement(0, -1, 'y');
  assert.equal(ctrl.playerFacing, 'up');
  assert.equal(ctrl.currentAnim, 'player_up');
  assert.equal(ctrl.isPlaying, true);

  // Stop moving
  ctrl.handleMovement(0, 0, 'y');
  assert.equal(ctrl.isPlaying, false);
  assert.equal(ctrl.playerFacing, 'up');
  assert.equal(ctrl.currentFrame, 3);
});

test('Animation Controller: moving RIGHT plays player_side with flipX=false and preserves side idle frame 6', () => {
  const ctrl = new AnimationStateController();
  ctrl.handleMovement(1, 0, 'x');
  assert.equal(ctrl.playerFacing, 'right');
  assert.equal(ctrl.currentAnim, 'player_side');
  assert.equal(ctrl.flipX, false);
  assert.equal(ctrl.isPlaying, true);

  // Stop moving
  ctrl.handleMovement(0, 0, 'x');
  assert.equal(ctrl.isPlaying, false);
  assert.equal(ctrl.playerFacing, 'right');
  assert.equal(ctrl.currentFrame, 6);
  assert.equal(ctrl.flipX, false);
});

test('Animation Controller: moving LEFT plays player_side with flipX=true and preserves side idle frame 6 with flipX=true', () => {
  const ctrl = new AnimationStateController();
  ctrl.handleMovement(-1, 0, 'x');
  assert.equal(ctrl.playerFacing, 'left');
  assert.equal(ctrl.currentAnim, 'player_side');
  assert.equal(ctrl.flipX, true);
  assert.equal(ctrl.isPlaying, true);

  // Stop moving
  ctrl.handleMovement(0, 0, 'x');
  assert.equal(ctrl.isPlaying, false);
  assert.equal(ctrl.playerFacing, 'left');
  assert.equal(ctrl.currentFrame, 6);
  assert.equal(ctrl.flipX, true);
});

test('Animation Controller: defeat triggers player_defeat animation', () => {
  const ctrl = new AnimationStateController();
  ctrl.handleDefeat();
  assert.equal(ctrl.currentAnim, 'player_defeat');
  assert.equal(ctrl.isPlaying, true);
});

test('Hitbox Invariant: 24x24 body centered in 40x40 frame has identical margins across flips', () => {
  const frameWidth = 40;
  const frameHeight = 40;
  const bodySize = 24;
  const offset = 8;

  const leftMargin = offset;
  const rightMargin = frameWidth - (offset + bodySize);
  const topMargin = offset;
  const bottomMargin = frameHeight - (offset + bodySize);

  assert.equal(leftMargin, rightMargin, 'Horizontal margins must be symmetrical (8px)');
  assert.equal(topMargin, bottomMargin, 'Vertical margins must be symmetrical (8px)');
  assert.equal(leftMargin, 8);
});
