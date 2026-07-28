# Phase 2 Camera Design Note

## Status
- Design only.
- No camera behavior is implemented yet.
- This note defines the intended camera model for a future Phase 2 implementation.

## Camera Principles

### 1. Input independence
Camera actions should be device-neutral and available through multiple input methods:
- Mouse
- Keyboard
- Trackpad
- Touch
- UI buttons

Core actions include:
- Zoom in/out
- Pan
- Fit to map
- Reset view
- Focus on a tile or structure

### 2. Zoom behavior
Zoom should be centered around the cursor or finger position where practical, rather than always zooming from the viewport center.

This should preserve spatial context and feel more natural during exploration.

### 3. Zoom limits
Zoom should be constrained to a practical range:
- Minimum zoom should show roughly one third of the 20x20 map.
- Maximum zoom should show roughly an 8x8 tile area.

### 4. Pan limits
Panning should allow users to move around the map comfortably, but the map should not be dragged completely away from view.

A reasonable limit is to allow roughly one tile beyond the map boundary while keeping the map visible at all times.

### 5. Animation
Camera movement should feel smooth and polished, but responsiveness and performance should take priority over decorative animation.

The implementation should favor immediate feedback over overly complex easing or effects.

### 6. Performance
Camera movement should transform a map/camera container rather than repositioning individual tiles or sprites.

This keeps the rendering model efficient and avoids expensive per-tile updates during pan and zoom.

### 7. Selection behavior
Tile and structure selection should remain independent of camera position and zoom.

Selection state should continue to work regardless of whether the user is zoomed in, panned, or viewing the map at a default scale.

### 8. Information panel behavior
Selecting a tile or structure should not automatically re-centre the map.

A future “centre on selected” action may be added separately if needed.

### 9. Rotation
Map rotation is not supported.

The camera model should remain planar and should not introduce rotation controls or rotated map views.

### 10. Future camera API
The camera layer should eventually expose clear, reusable actions such as:
- zoomIn()
- zoomOut()
- pan(dx, dy)
- fit()
- reset()
- focusTile(tile)
- focusStructure(structure)

These actions should be implemented behind a stable camera interface so future UI controls and input handlers can share the same behavior.

## Design Intent
The Phase 2 camera system should make the map feel responsive and intuitive while preserving the existing map data model, selection model, and rendering architecture.
