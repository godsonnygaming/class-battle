# Anime Island: Stormbound (3D browser prototype)

Original 3D anime-adventure prototype for the browser. It is inspired by the broad genre of island exploration and action RPGs, but uses original names and assets.

## Deploy to Render
1. Extract this ZIP on Windows.
2. Upload the CONTENTS of `anime-island-3d` to a new GitHub repository. `package.json` must be at repository root.
3. On Render choose New + -> Web Service and connect the repository.
4. Runtime: Node. Root Directory: leave blank when `package.json` is at repository root.
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Deploy. This prototype loads Three.js from jsDelivr, so players need internet access.

## Controls
- WASD or arrow keys: move
- Mouse: look around; right-click to enable pointer lock
- Click or Space: sword slash
- Q: Storm Burst area attack
- E: dash
- F: accept quest near the gold guide
- Defeat 5 bandits to unlock the Tempest Guardian boss

## Notes
- Browser-based 3D prototype, no database required.
- This is a single-player prototype; progress resets on reload.
- The 3D scene uses procedural shapes, not copyrighted Blox Fruits assets.
