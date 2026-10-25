// ============================================================
// Fractal Mosaic with Per-Cell Apex Rotation - TouchDesigner GLSL Multi TOP
//
// Input wiring:
//   input 0             -> control map (R = subdivision level 0-3)
//   input 1             -> level-0 index map (R=from, G=to, B=t)
//   input 2             -> level-1 index map
//   input 3             -> level-2 index map
//   input 4             -> level-3 index map
//   input 5 .. input N+4 -> thumbnail images
// ============================================================
out vec4 fragColor;
// --- Uniforms ---
uniform vec2  uGridSize;            // Base grid, e.g. (60.0, 60.0)
uniform float uNumImages;           // Thumbnail count (inputs 5..N+4)
uniform int   uThumbInputOffset;    // Default = 5
uniform float uIndexIsNormalized;   // 0.0 = raw integer indices (default)
uniform float uLevelIsNormalized;   // 0.0 = raw integer level 0-3 (default)
// --- Subdivision Contrast Uniform ---
uniform float uSubdivMultiplier;    // Default = 2.0 (original behavior: 1,2,4,8). >2.0 = more size contrast between L0 and L3, <2.0 = subtler contrast.
// --- Rotation Uniforms ---
uniform vec2  uApexUV;              // Apex center in top UV space, default = vec2(0.5, 0.5)
uniform int   uRotationMode;        // 0 = Off, 1 = Continuous Radial to Apex, 2 = 4-Face 90° Snap
int decodeIndex(float raw)
{
	float scaled = mix(raw, raw * (uNumImages - 1.0), uIndexIsNormalized);
	int idx = int(floor(scaled + 0.5));
	return clamp(idx, 0, int(uNumImages) - 1);
}
int decodeLevel(float raw)
{
	float scaled = mix(raw, raw * 3.0, uLevelIsNormalized);
	int lvl = int(floor(scaled + 0.5));
	return clamp(lvl, 0, 3);
}
void main()
{
	vec2 uv = vUV.st;
	// --- 1. Base Tile Calculation ---
	vec2 baseGridUV  = uv * uGridSize;
	vec2 baseCellId  = floor(baseGridUV);
	vec2 baseLocalUV = fract(baseGridUV);
	// --- 2. Subdivision Level Lookup ---
	vec2 controlUV = (baseCellId + 0.5) / uGridSize;
	float rawLevel = texture(sTD2DInputs[0], controlUV).r;
	int L = decodeLevel(rawLevel);
	float factor = pow(uSubdivMultiplier, float(L)); // e.g. 1, mult, mult^2, mult^3
	// --- 3. Sub-Cell Local & Global Position ---
	vec2 subCellId  = floor(baseLocalUV * factor);
	vec2 subLocalUV = fract(baseLocalUV * factor);
	vec2 levelGridSize = uGridSize * factor;
	vec2 fineCellId    = baseCellId * factor + subCellId;
	vec2 fineUV        = (fineCellId + 0.5) / levelGridSize; // Global center of fine cell
	// --- 4. Apex Rotation Matrix ---
	vec2 sampleUV = subLocalUV;
	if (uRotationMode > 0)
	{
		vec2 dirToApex = uApexUV - fineUV;
		vec2 targetUp = vec2(0.0, 1.0); // Default UP vector
		if (uRotationMode == 1)
		{
			// Continuous smooth rotation directly toward Apex
			float dist = length(dirToApex);
			if (dist > 0.0001) {
				targetUp = dirToApex / dist;
			}
		}
		else if (uRotationMode == 2)
		{
			// 4-Face 90-degree Snap (North, South, East, West pyramid faces)
			if (abs(dirToApex.x) > abs(dirToApex.y)) {
				targetUp = vec2(sign(dirToApex.x), 0.0);
			} else {
				targetUp = vec2(0.0, sign(dirToApex.y));
			}
		}
		// Perpendicular vector for horizontal texture axis (+X)
		vec2 targetRight = vec2(targetUp.y, -targetUp.x);
		// Transform local cell UV relative to tile center (0.5, 0.5)
		vec2 centeredLocal = subLocalUV - vec2(0.5);
		sampleUV = vec2(
			dot(centeredLocal, targetRight),
			dot(centeredLocal, targetUp)
		) + vec2(0.5);
	}
	// --- 5. Index Lookup & Sampling ---
	vec3 idxSample;
	if (L == 0)      idxSample = texture(sTD2DInputs[1], fineUV).rgb;
	else if (L == 1) idxSample = texture(sTD2DInputs[2], fineUV).rgb;
	else if (L == 2) idxSample = texture(sTD2DInputs[3], fineUV).rgb;
	else             idxSample = texture(sTD2DInputs[4], fineUV).rgb;
	int fromIdx = decodeIndex(idxSample.r);
	int toIdx   = decodeIndex(idxSample.g);
	float t     = clamp(idxSample.b, 0.0, 1.0);
	int fromSlot = fromIdx + uThumbInputOffset;
	int toSlot   = toIdx   + uThumbInputOffset;
	// Sample thumbnails using the rotated local UVs
	vec4 fromColor = texture(sTD2DInputs[fromSlot], sampleUV);
	vec4 toColor   = texture(sTD2DInputs[toSlot],   sampleUV);
	vec4 finalColor = mix(fromColor, toColor, t);
	fragColor = TDOutputSwizzle(finalColor);
}
