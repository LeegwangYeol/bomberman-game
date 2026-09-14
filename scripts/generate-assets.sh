#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$REPO_ROOT/public/assets"
TEMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TEMP_DIR"' EXIT

mkdir -p "$TARGET_DIR"

# 1. Player: Cute white bomber with blue suit and pink pom-pom
cat << 'SVG' > "$TEMP_DIR/player.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <radialGradient id="pom" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ff99bb"/>
      <stop offset="100%" stop-color="#e6005c"/>
    </radialGradient>
    <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <linearGradient id="headGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="80%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
  </defs>
  <!-- Shadow -->
  <ellipse cx="20" cy="37" rx="14" ry="3" fill="rgba(0,0,0,0.25)"/>
  <!-- Feet -->
  <ellipse cx="14" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
  <ellipse cx="26" cy="35" rx="5" ry="3.5" fill="#ef4444"/>
  <!-- Body (Blue suit) -->
  <rect x="11" y="22" width="18" height="13" rx="5" fill="url(#bodyGrad)" stroke="#1e3a8a" stroke-width="1.2"/>
  <rect x="13" y="28" width="14" height="3" fill="#1e293b"/>
  <rect x="18" y="27.5" width="4" height="4" fill="#fbbf24"/>
  <!-- Pom-pom antenna -->
  <rect x="18.5" y="2" width="3" height="6" fill="#64748b" rx="1"/>
  <circle cx="20" cy="4" r="4" fill="url(#pom)" stroke="#be123c" stroke-width="1"/>
  <!-- Head (White helmet) -->
  <rect x="7" y="6" width="26" height="20" rx="9" fill="url(#headGrad)" stroke="#334155" stroke-width="1.5"/>
  <!-- Face visor / opening -->
  <rect x="11" y="10" width="18" height="13" rx="6" fill="#ffe4e6" stroke="#fb7185" stroke-width="1"/>
  <!-- Eyes (cute anime-style dots with twinkle) -->
  <ellipse cx="15.5" cy="16" rx="2" ry="3" fill="#0f172a"/>
  <circle cx="15" cy="15" r="0.8" fill="#ffffff"/>
  <ellipse cx="24.5" cy="16" rx="2" ry="3" fill="#0f172a"/>
  <circle cx="24" cy="15" r="0.8" fill="#ffffff"/>
  <!-- Blush -->
  <ellipse cx="13" cy="19" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
  <ellipse cx="27" cy="19" rx="2" ry="1.2" fill="#f43f5e" opacity="0.6"/>
</svg>
SVG

# 2. Enemy (Basic wanderer - cute balloon monster)
cat << 'SVG' > "$TEMP_DIR/enemy.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <radialGradient id="balloonGrad" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ff8080"/>
      <stop offset="70%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#991b1b"/>
    </radialGradient>
  </defs>
  <!-- Shadow -->
  <ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.25)"/>
  <!-- Main round body -->
  <circle cx="20" cy="19" r="16" fill="url(#balloonGrad)" stroke="#7f1d1d" stroke-width="1.5"/>
  <!-- Highlight -->
  <ellipse cx="15" cy="10" rx="5" ry="2.5" fill="#ffffff" opacity="0.5" transform="rotate(-25, 15, 10)"/>
  <!-- Big silly eyes -->
  <ellipse cx="14" cy="17" rx="4" ry="5.5" fill="#ffffff" stroke="#7f1d1d" stroke-width="1"/>
  <circle cx="14.5" cy="18" r="2.5" fill="#1e293b"/>
  <circle cx="13.5" cy="16.5" r="1" fill="#ffffff"/>
  <ellipse cx="26" cy="17" rx="4" ry="5.5" fill="#ffffff" stroke="#7f1d1d" stroke-width="1"/>
  <circle cx="25.5" cy="18" r="2.5" fill="#1e293b"/>
  <circle cx="24.5" cy="16.5" r="1" fill="#ffffff"/>
  <!-- Cute mouth with tooth -->
  <path d="M 16 26 Q 20 30 24 26 Z" fill="#450a0a"/>
  <polygon points="18,26 20,26 19,28" fill="#ffffff"/>
  <!-- Blush -->
  <ellipse cx="10" cy="22" rx="2" ry="1.2" fill="#fb7185" opacity="0.7"/>
  <ellipse cx="30" cy="22" rx="2" ry="1.2" fill="#fb7185" opacity="0.7"/>
</svg>
SVG

# 3. Enemy Tracker (Fast/Hunting enemy - purple bat/specter)
cat << 'SVG' > "$TEMP_DIR/enemy_tracker.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <radialGradient id="trackerGrad" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="60%" stop-color="#9333ea"/>
      <stop offset="100%" stop-color="#581c87"/>
    </radialGradient>
  </defs>
  <!-- Shadow -->
  <ellipse cx="20" cy="37" rx="12" ry="2.8" fill="rgba(0,0,0,0.3)"/>
  <!-- Horns / Wings -->
  <polygon points="8,10 14,14 7,18" fill="#6b21a8" stroke="#3b0764" stroke-width="1"/>
  <polygon points="32,10 26,14 33,18" fill="#6b21a8" stroke="#3b0764" stroke-width="1"/>
  <!-- Body -->
  <ellipse cx="20" cy="20" rx="14" ry="15" fill="url(#trackerGrad)" stroke="#3b0764" stroke-width="1.5"/>
  <!-- Ghostly tail wisps -->
  <path d="M 10 32 Q 13 37 16 32 Q 20 37 24 32 Q 27 37 30 32 Z" fill="#7e22ce"/>
  <!-- Angry / Tracking Eyes -->
  <polygon points="11,14 19,17 13,20" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>
  <circle cx="15" cy="17" r="1.5" fill="#dc2626"/>
  <polygon points="29,14 21,17 27,20" fill="#fef08a" stroke="#ca8a04" stroke-width="1"/>
  <circle cx="25" cy="17" r="1.5" fill="#dc2626"/>
  <!-- Sharp tooth smile -->
  <path d="M 15 25 Q 20 29 25 25" stroke="#fef08a" stroke-width="1.8" fill="none"/>
</svg>
SVG

# 4. Bomb (Glossy cherry bomb with glowing fuse spark)
cat << 'SVG' > "$TEMP_DIR/bomb.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <radialGradient id="bombGrad" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="45%" stop-color="#1e293b"/>
      <stop offset="85%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <radialGradient id="sparkGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#fef08a"/>
      <stop offset="80%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <!-- Shadow -->
  <ellipse cx="20" cy="37" rx="13" ry="3" fill="rgba(0,0,0,0.35)"/>
  <!-- Spark -->
  <circle cx="29" cy="5" r="4.5" fill="url(#sparkGrad)"/>
  <polygon points="29,1 30,5 34,5 31,7 32,11 29,8 26,11 27,7 24,5 28,5" fill="#facc15"/>
  <!-- Fuse -->
  <path d="M 21 11 Q 25 7 29 6" stroke="#ca8a04" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <!-- Collar -->
  <rect x="16" y="9" width="8" height="4" rx="1.5" fill="#94a3b8" stroke="#334155" stroke-width="1"/>
  <!-- Spherical body -->
  <circle cx="20" cy="23" r="14.5" fill="url(#bombGrad)" stroke="#0f172a" stroke-width="1.5"/>
  <!-- Specular shine -->
  <ellipse cx="15" cy="17" rx="4.5" ry="2.5" fill="#ffffff" opacity="0.65" transform="rotate(-30, 15, 17)"/>
  <circle cx="12" cy="22" r="1.5" fill="#ffffff" opacity="0.4"/>
</svg>
SVG

# 5. Explosion (Multi-tier comic explosion burst)
cat << 'SVG' > "$TEMP_DIR/explosion.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <radialGradient id="fireGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="25%" stop-color="#fef08a"/>
      <stop offset="55%" stop-color="#f97316"/>
      <stop offset="85%" stop-color="#ef4444"/>
      <stop offset="100%" stop-color="#b91c1c"/>
    </radialGradient>
  </defs>
  <!-- Outer flame starburst -->
  <path d="M 20 2 Q 24 10 32 6 Q 28 14 38 17 Q 30 22 36 30 Q 26 27 25 38 Q 20 31 15 38 Q 14 28 4 30 Q 10 22 2 17 Q 12 14 8 6 Q 16 10 20 2 Z" fill="url(#fireGrad)"/>
  <!-- Inner bright burst -->
  <polygon points="20,8 23,15 31,13 26,19 32,25 24,24 20,31 16,24 8,25 14,19 9,13 17,15" fill="#fef08a"/>
  <!-- Core spark -->
  <circle cx="20" cy="20" r="5" fill="#ffffff"/>
</svg>
SVG

# 6. Wall (Unbreakable hard block with 3D bevel and rivets)
cat << 'SVG' > "$TEMP_DIR/wall.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <linearGradient id="wallFace" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <!-- Outer beveled border -->
  <rect width="40" height="40" fill="#1e293b"/>
  <!-- Top/Left light highlight bevel -->
  <polygon points="0,0 40,0 36,4 4,4 4,36 0,40" fill="#94a3b8"/>
  <!-- Bottom/Right dark bevel -->
  <polygon points="40,0 40,40 0,40 4,36 36,36 36,4" fill="#0f172a"/>
  <!-- Center Plate -->
  <rect x="4" y="4" width="32" height="32" fill="url(#wallFace)"/>
  <!-- Inner metallic inset frame -->
  <rect x="7" y="7" width="26" height="26" fill="none" stroke="#1e293b" stroke-width="1.5"/>
  <rect x="8" y="8" width="24" height="24" fill="none" stroke="#475569" stroke-width="1"/>
  <!-- Steel Rivets in 4 corners -->
  <circle cx="10" cy="10" r="1.5" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8"/>
  <circle cx="30" cy="10" r="1.5" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8"/>
  <circle cx="10" cy="30" r="1.5" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8"/>
  <circle cx="30" cy="30" r="1.5" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8"/>
  <!-- Central cross emblem -->
  <rect x="18" y="14" width="4" height="12" fill="#1e293b" rx="1"/>
  <rect x="14" y="18" width="12" height="4" fill="#1e293b" rx="1"/>
</svg>
SVG

# 7. Block (Breakable soft block with terracotta brick layers)
cat << 'SVG' > "$TEMP_DIR/block.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <linearGradient id="brickGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#c2410c"/>
    </linearGradient>
    <linearGradient id="brickGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="100%" stop-color="#ea580c"/>
    </linearGradient>
  </defs>
  <!-- Mortar background -->
  <rect width="40" height="40" fill="#78350f" rx="3"/>
  <rect x="1" y="1" width="38" height="38" fill="#451a03" rx="2"/>
  <!-- Row 1 bricks -->
  <rect x="2" y="2" width="17" height="10" rx="1.5" fill="url(#brickGrad1)" stroke="#9a3412" stroke-width="0.8"/>
  <rect x="21" y="2" width="17" height="10" rx="1.5" fill="url(#brickGrad2)" stroke="#9a3412" stroke-width="0.8"/>
  <!-- Brick highlights -->
  <line x1="3" y1="3.5" x2="18" y2="3.5" stroke="#fed7aa" stroke-width="0.8" opacity="0.7"/>
  <line x1="22" y1="3.5" x2="37" y2="3.5" stroke="#fed7aa" stroke-width="0.8" opacity="0.7"/>

  <!-- Row 2 bricks (staggered) -->
  <rect x="2" y="14" width="8" height="11" rx="1.5" fill="url(#brickGrad2)" stroke="#9a3412" stroke-width="0.8"/>
  <rect x="12" y="14" width="16" height="11" rx="1.5" fill="url(#brickGrad1)" stroke="#9a3412" stroke-width="0.8"/>
  <rect x="30" y="14" width="8" height="11" rx="1.5" fill="url(#brickGrad2)" stroke="#9a3412" stroke-width="0.8"/>
  <!-- Highlights -->
  <line x1="13" y1="15.5" x2="27" y2="15.5" stroke="#fed7aa" stroke-width="0.8" opacity="0.7"/>

  <!-- Row 3 bricks -->
  <rect x="2" y="27" width="17" height="11" rx="1.5" fill="url(#brickGrad1)" stroke="#9a3412" stroke-width="0.8"/>
  <rect x="21" y="27" width="17" height="11" rx="1.5" fill="url(#brickGrad2)" stroke="#9a3412" stroke-width="0.8"/>
  <!-- Highlights -->
  <line x1="3" y1="28.5" x2="18" y2="28.5" stroke="#fed7aa" stroke-width="0.8" opacity="0.7"/>
  <line x1="22" y1="28.5" x2="37" y2="28.5" stroke="#fed7aa" stroke-width="0.8" opacity="0.7"/>
</svg>
SVG

# 8. Floor Tile (Checkered lawn meadow tile)
cat << 'SVG' > "$TEMP_DIR/floor.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <defs>
    <linearGradient id="grassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#86efac"/>
      <stop offset="100%" stop-color="#4ade80"/>
    </linearGradient>
  </defs>
  <!-- Soft green lawn tile with checkered subtle pattern -->
  <rect width="40" height="40" fill="url(#grassGrad)"/>
  <!-- Subtle checker pattern -->
  <rect x="0" y="0" width="20" height="20" fill="#22c55e" opacity="0.12"/>
  <rect x="20" y="20" width="20" height="20" fill="#22c55e" opacity="0.12"/>
  <!-- Tiny grass blade accents -->
  <path d="M 8 14 Q 9 10 11 12" stroke="#16a34a" stroke-width="1" fill="none" opacity="0.4"/>
  <path d="M 28 28 Q 30 25 32 27" stroke="#16a34a" stroke-width="1" fill="none" opacity="0.4"/>
  <!-- Soft border seam -->
  <rect width="40" height="40" fill="none" stroke="#22c55e" stroke-width="0.6" opacity="0.3"/>
</svg>
SVG

# 9. Background (800x600 Arena Backdrop with sky, clouds, and golden arena rail)
cat << 'SVG' > "$TEMP_DIR/background.svg"
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="70%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
    <linearGradient id="arenaBorder" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#15803d"/>
      <stop offset="100%" stop-color="#166534"/>
    </linearGradient>
  </defs>
  <!-- Sky background -->
  <rect width="800" height="600" fill="url(#skyGrad)"/>
  <!-- Distant cute clouds -->
  <ellipse cx="120" cy="70" rx="60" ry="22" fill="#ffffff" opacity="0.75"/>
  <ellipse cx="160" cy="65" rx="45" ry="28" fill="#ffffff" opacity="0.8"/>
  <ellipse cx="680" cy="90" rx="70" ry="25" fill="#ffffff" opacity="0.75"/>
  <ellipse cx="640" cy="85" rx="50" ry="30" fill="#ffffff" opacity="0.8"/>
  <!-- Stadium outer ring / lawn border -->
  <rect x="70" y="20" width="660" height="560" rx="24" fill="url(#arenaBorder)" stroke="#14532d" stroke-width="4"/>
  <!-- Arena Outer Track / Curb -->
  <rect x="88" y="30" width="624" height="540" rx="16" fill="#ca8a04" stroke="#a16207" stroke-width="3"/>
  <rect x="94" y="35" width="612" height="530" rx="12" fill="#eab308" stroke="#facc15" stroke-width="1.5"/>
  <!-- Inner playfield slot (600x520 at x=100, y=40) -->
  <rect x="98" y="38" width="604" height="524" rx="6" fill="#14532d" opacity="0.4"/>
</svg>
SVG

# Convert all SVGs to PNGs using macOS sips
for svg in "$TEMP_DIR"/*.svg; do
  name=$(basename "$svg" .svg)
  if [ "$name" = "background" ]; then
    sips -s format png -z 600 800 "$svg" --out "$TARGET_DIR/${name}.png" >/dev/null
  else
    sips -s format png -z 40 40 "$svg" --out "$TARGET_DIR/${name}.png" >/dev/null
  fi
done

echo "Asset generation complete in $TARGET_DIR:"
ls -la "$TARGET_DIR"/*.png
