# Smoke Test Checklist

Use this quick checklist after changes to verify core gameplay is intact.

1. Load
- Open index.html in a browser (or the deployed URL).
- Confirm no errors in the browser console.

2. Level generation
- Start on floor 1.
- Confirm the player is placed in a room and at least one staircase exists.
- Move a few tiles; FOV updates and seen memory persists.

3. Movement and combat
- Bump into an enemy to attack.
- See damage, crits, blocks, and blood decals.
- Enemies take turns and can attack you when adjacent.

4. Looting
- Kill an enemy; a corpse appears.
- Press G to loot; ensure auto-equip logic works and inventory updates.
- If a chest is present in the start room, open and loot it.

5. GOD panel
- Press P to open GOD panel.
- Adjust FOV slider; confirm FOV changes.
- Toggle Side Log; right-hand log mirrors on/off.
- Toggle Always Crit and choose a body part; confirm UI label updates.
- Apply a seed and reroll; confirm floor regenerates and seed reflects in UI.

6. Descend
- Stand on the '>' tile and press N/Enter.
- Confirm floor increases, map regenerates, and UI updates.

7. Status effects
- Confirm bleeding/dazed messages appear and fade naturally.
- Ensure bleed ticks don’t spam excessively.

If any step fails, capture console errors and the action performed, then fix and re-run this checklist.