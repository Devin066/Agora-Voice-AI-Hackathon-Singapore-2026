shader_type canvas_item;

uniform vec4 dust_tint : source_color = vec4(0.26, 0.18, 0.14, 1.0);
uniform vec4 edge_tint : source_color = vec4(0.09, 0.06, 0.05, 1.0);
uniform vec4 seam_tint : source_color = vec4(0.13, 0.08, 0.07, 1.0);
uniform float grain_strength : hint_range(0.0, 1.0, 0.01) = 0.22;
uniform float stain_strength : hint_range(0.0, 1.0, 0.01) = 0.18;
uniform float edge_strength : hint_range(0.0, 1.0, 0.01) = 0.32;
uniform float seam_strength : hint_range(0.0, 1.0, 0.01) = 0.28;

float hash12(vec2 p) {
	p = fract(p * vec2(123.34, 345.45));
	p += dot(p, p + 34.345);
	return fract(p.x * p.y);
}

float grain(vec2 uv, float scale) {
	vec2 cell = floor(uv * scale);
	return hash12(cell);
}

void fragment() {
	vec2 uv = UV;
	float coarse = grain(uv, 180.0);
	float fine = grain(uv + vec2(0.13, 0.27), 420.0);
	float fibers = sin((uv.y + coarse * 0.05) * 520.0) * 0.5 + 0.5;
	float dust = mix(coarse, fine, 0.45) * grain_strength;
	float stain = smoothstep(0.54, 0.96, coarse) * stain_strength;
	float edge = 1.0;
	edge *= smoothstep(0.0, 0.12, uv.x);
	edge *= smoothstep(0.0, 0.08, uv.y);
	edge *= smoothstep(0.0, 0.12, 1.0 - uv.x);
	edge *= smoothstep(0.0, 0.08, 1.0 - uv.y);
	float edge_mask = (1.0 - edge) * edge_strength;
	float seam = exp(-pow((uv.x - 0.5) * 16.0, 2.0)) * seam_strength;

	vec3 color = dust_tint.rgb;
	color = mix(color, edge_tint.rgb, clamp(edge_mask * 1.45, 0.0, 1.0));
	color = mix(color, seam_tint.rgb, clamp(seam, 0.0, 1.0));
	float alpha = dust * 0.45 + stain * (0.25 + fibers * 0.12) + edge_mask * 0.7 + seam * 0.75;

	COLOR = vec4(color, clamp(alpha, 0.0, 0.62));
}
