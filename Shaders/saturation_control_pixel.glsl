#version 300 es
// ============================================================
// Adaptive Saturation Control — WebGL2 FX Stage Pass (D5)
// Ported from TouchDesigner GLSL Multi TOP (saturation_control_pixel.glsl)
//
// Adjusts saturation per-pixel based on a control map: the mask value
// (0-1) is remapped into a [uMinSaturation, uMaxSaturation] range and
// used as the saturation multiplier at that pixel. Values above 1.0
// oversaturate, 1.0 = untouched, 0.0 = grayscale.
//
// Input wiring:
//   uScene  (input 0) -> mosaic shader FBO output
//   uSatMap (input 1) -> saturation control map (grayscale R: 0 -> uMinSaturation, 1 -> uMaxSaturation)
// ============================================================
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uSatMap;
uniform float uMinSaturation; // default 0.0 -- saturation multiplier where map = 0
uniform float uMaxSaturation; // default 5.0 -- saturation multiplier where map = 1 (>1 = oversaturated)

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void main()
{
	// Flip vUv.y so top-down texture coordinates (row 0 = top) map to
	// top of the WebGL screen viewport (gl_Position.y = +1).
	vec2 uv = vec2(vUv.x, 1.0 - vUv.y);

	vec4 srcColor = texture(uScene, uv);
	float maskValue = texture(uSatMap, uv).r;

	float satAmount = mix(uMinSaturation, uMaxSaturation, maskValue);

	// perceptual luminance (Rec. 709 weights)
	float luma = dot(srcColor.rgb, LUMA);

	vec3 result = clamp(mix(vec3(luma), srcColor.rgb, satAmount), 0.0, 1.0);

	fragColor = vec4(result, 1.0);
}
