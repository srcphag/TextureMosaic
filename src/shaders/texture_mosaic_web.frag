#version 300 es
// ============================================================
// Texture Mosaic — WebGL2 port of texture_mosaic.frag (TouchDesigner)
//
// The TouchDesigner shader is the source of truth. This file must
// give the same pixels. Differences are only the ones WebGL needs:
//   - sTD2DInputs[5..N+4] (thumbnails) -> one sampler2DArray (uStack)
//   - sTD2DInputs[1..4] (index maps)   -> uIndexMap0..uIndexMap3
//   - sTD2DInputs[0] (subdivision map) -> uControl luminance,
//     with the app's control stage (contrast, offset, cyclic)
//   - vUV / TDOutputSwizzle            -> vUv / plain output
//   - UV origin is top-left (row 0 = top), matching the app's
//     texture upload and readPixels conventions.
//
// The output is always opaque (alpha = 1). The app flattens images
// with transparency over black when it loads them.
//
// Textures:
//   uControl    -> control map (video or image), RGB.
//                  Its luminance at each base-cell center picks the
//                  subdivision level L (0..3).
//   uIndexMap0..3 -> per-level index maps (R = from index,
//                  G = to index, B = crossfade t), sampled at fineUV.
//   uMask       -> mask (luminance). white = mosaic, black = original
//                  control. With no mask loaded: uMaskInfluence = 0.
//   uStack      -> TEXTURE_2D_ARRAY, one layer per thumbnail image,
//                  all the same size (app working resolution).
// ============================================================
precision highp float;
precision highp int;
precision highp sampler2DArray;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D      uControl;
uniform sampler2D      uIndexMap0;
uniform sampler2D      uIndexMap1;
uniform sampler2D      uIndexMap2;
uniform sampler2D      uIndexMap3;
uniform sampler2D      uMask;
uniform sampler2DArray uStack;

uniform int   uNumImages;          // thumbnail count in uStack, 1..MAX_LAYERS
uniform vec2  uGridSize;           // base grid, default (60.0, 60.0)
uniform float uSubdivMultiplier;   // default 2.0 -> sub-cell factors 1, 2, 4, 8
uniform vec2  uApexUV;             // apex center in UV space, default (0.5, 0.5)
uniform int   uRotationMode;       // 0 = Off, 1 = Continuous Radial to Apex, 2 = 4-Face 90deg Snap

uniform float uSmoothBlend;        // 0.0 = hard switch (from layer only), 1.0 = mix(from, to, t)
uniform float uIndexIsNormalized;  // 1.0 = index maps store normalized 0..1 (web default), 0.0 = raw integer indices

// Control stage (same as texture stack)
uniform float uContrast;           // 1.0 = unchanged, >1 = more contrast, 0 = flat grey
uniform float uOffset;             // 0-1, added to control luminance (animate this)
uniform float uCyclic;             // 1.0 = subdivision levels wrap 0->1->2->3->0, 0.0 = clamps
uniform float uInvertControl;      // 0.0 = normal, 1.0 = invert control RGB before contrast

// Mask stage (same as texture stack)
uniform float uMaskInfluence;      // 0.0 = mask ignored, 1.0 = mask fully applied
uniform float uInvertMask;         // 0.0 = normal, 1.0 = flip mask
uniform float uMaskMin;            // 0-1, mask values at or below this become 0
uniform float uMaskMax;            // 0-1, mask values at or above this become 1

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec4 fetchLayer(int i, vec2 uv)
{
	return texture(uStack, vec3(uv, float(i)));
}

int decodeIndex(float raw)
{
	int n = max(uNumImages, 1);
	float scaled = mix(raw, raw * (float(n) - 1.0), uIndexIsNormalized);
	return clamp(int(floor(scaled + 0.5)), 0, n - 1);
}

void main()
{
	vec2 uv = vUv;

	// --- 1. Base Tile Calculation ---
	vec2 baseGridUV  = uv * uGridSize;
	vec2 baseCellId  = floor(baseGridUV);
	vec2 baseLocalUV = fract(baseGridUV);

	// --- 2. Subdivision Level Lookup (control stage) ---
	vec2 controlUV = (baseCellId + 0.5) / uGridSize;
	vec3 controlAtCell = texture(uControl, controlUV).rgb;
	vec3 ctrlRgb = mix(controlAtCell, 1.0 - controlAtCell, step(0.5, uInvertControl));

	// contrast around mid-grey, applied before the luminance lookup
	vec3  contrasted = clamp((ctrlRgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
	float lum        = dot(contrasted, LUMA);

	int L;
	if (uCyclic > 0.5)
	{
		// levels wrap: 0 -> 1 -> 2 -> 3 -> 0 ...
		float s = fract(lum + uOffset) * 4.0;
		L = int(floor(s)) % 4;
	}
	else
	{
		float s = clamp(lum + uOffset, 0.0, 1.0) * 3.0;
		L = clamp(int(floor(s + 0.5)), 0, 3);
	}

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
	if (L == 0)      idxSample = texture(uIndexMap0, fineUV).rgb;
	else if (L == 1) idxSample = texture(uIndexMap1, fineUV).rgb;
	else if (L == 2) idxSample = texture(uIndexMap2, fineUV).rgb;
	else             idxSample = texture(uIndexMap3, fineUV).rgb;

	int   fromIdx = decodeIndex(idxSample.r);
	int   toIdx   = decodeIndex(idxSample.g);
	float t       = clamp(idxSample.b, 0.0, 1.0);

	// Sample thumbnails using the rotated local UVs
	vec4 fromColor = fetchLayer(fromIdx, sampleUV);
	vec4 toColor   = fetchLayer(toIdx,   sampleUV);
	vec4 mosaic    = uSmoothBlend < 0.5 ? fromColor : mix(fromColor, toColor, t);

	// --- 6. Mask ---
	float mask = dot(texture(uMask, uv).rgb, LUMA);

	// clamp from bottom and top, then stretch the remaining range to 0-1
	float lo = min(uMaskMin, uMaskMax);
	float hi = max(uMaskMin, uMaskMax);
	mask = clamp((mask - lo) / max(hi - lo, 1e-5), 0.0, 1.0);

	mask = mix(mask, 1.0 - mask, step(0.5, uInvertMask));
	float m = mix(1.0, mask, clamp(uMaskInfluence, 0.0, 1.0));

	// original (un-contrasted, un-offset) control image where m = 0,
	// mosaic where m = 1
	vec4 original = vec4(texture(uControl, uv).rgb, 1.0);
	fragColor = vec4(mix(original.rgb, mosaic.rgb, m), 1.0);
}
