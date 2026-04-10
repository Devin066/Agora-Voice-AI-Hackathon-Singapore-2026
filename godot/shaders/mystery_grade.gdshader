/*
Adapted for this project from the MIT-licensed
"OKLCH Posterization/Color Palette Shader" by Yugen:
https://godotshaders.com/shader/oklch-posterization-color-palette-shader/
*/

shader_type canvas_item;

#include "res://shaders/forest_palette.gdshaderinc"

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear_mipmap;

group_uniforms Posterize;
uniform float palette_mix : hint_range(0.0, 1.0, 0.01) = 0.88;
uniform int lightness_steps : hint_range(2, 32, 1) = 14;
uniform int chroma_steps : hint_range(2, 16, 1) = 6;
uniform float hue_step_degrees : hint_range(5.0, 90.0, 1.0) = 18.0;
group_uniforms;

group_uniforms Atmosphere;
uniform vec3 fog_tint : source_color = vec3(0.82, 0.86, 0.73);
uniform float fog_strength : hint_range(0.0, 1.0, 0.01) = 0.18;
uniform float bloom_strength : hint_range(0.0, 1.0, 0.01) = 0.18;
uniform float bloom_lod : hint_range(0.0, 5.0, 0.1) = 2.4;
uniform float vignette_strength : hint_range(0.0, 1.0, 0.01) = 0.34;
uniform float shadow_crush : hint_range(0.5, 1.5, 0.01) = 1.08;
group_uniforms;

float posterize_step(float value, float levels) {
	return round(value * levels) / levels;
}

vec3 get_nearest_color(vec3 color) {
	float min_diff = 1000.0;
	vec3 nearest_color = color;
	for (int i = 0; i < COLOR_PALETTE.length(); i++) {
		float curr_dist = distance(COLOR_PALETTE[i], color);
		if (curr_dist < min_diff) {
			min_diff = curr_dist;
			nearest_color = COLOR_PALETTE[i];
		}
	}
	return nearest_color;
}

vec3 rgb_to_oklch(vec3 rgb) {
	vec3 linear_rgb;
	linear_rgb.r = (rgb.r <= 0.04045) ? rgb.r / 12.92 : pow((rgb.r + 0.055) / 1.055, 2.4);
	linear_rgb.g = (rgb.g <= 0.04045) ? rgb.g / 12.92 : pow((rgb.g + 0.055) / 1.055, 2.4);
	linear_rgb.b = (rgb.b <= 0.04045) ? rgb.b / 12.92 : pow((rgb.b + 0.055) / 1.055, 2.4);

	float x = linear_rgb.r * 0.4124 + linear_rgb.g * 0.3576 + linear_rgb.b * 0.1805;
	float y = linear_rgb.r * 0.2126 + linear_rgb.g * 0.7152 + linear_rgb.b * 0.0722;
	float z = linear_rgb.r * 0.0193 + linear_rgb.g * 0.1192 + linear_rgb.b * 0.9505;

	float xd65 = 0.95047;
	float yd65 = 1.0;
	float zd65 = 1.08883;

	float x_norm = x / xd65;
	float y_norm = y / yd65;
	float z_norm = z / zd65;

	float fx = (x_norm > 0.008856) ? pow(x_norm, 1.0 / 3.0) : (7.787 * x_norm + 16.0 / 116.0);
	float fy = (y_norm > 0.008856) ? pow(y_norm, 1.0 / 3.0) : (7.787 * y_norm + 16.0 / 116.0);
	float fz = (z_norm > 0.008856) ? pow(z_norm, 1.0 / 3.0) : (7.787 * z_norm + 16.0 / 116.0);

	float l_lab = 116.0 * fy - 16.0;
	float a_lab = 500.0 * (fx - fy);
	float b_lab = 200.0 * (fy - fz);

	float c = sqrt(a_lab * a_lab + b_lab * b_lab);
	float h = degrees(atan(b_lab, a_lab));
	if (h < 0.0) {
		h += 360.0;
	}

	return vec3(l_lab / 100.0, c / 100.0, h);
}

vec3 oklch_to_rgb(vec3 lch) {
	float l = lch.x * 100.0;
	float c = lch.y * 100.0;
	float h_rad = radians(lch.z);
	float a_lab = cos(h_rad) * c;
	float b_lab = sin(h_rad) * c;

	float fy = (l + 16.0) / 116.0;
	float fx = a_lab / 500.0 + fy;
	float fz = fy - b_lab / 200.0;
	vec3 f = vec3(fx, fy, fz);
	vec3 f_cubed = pow(f, vec3(3.0));
	vec3 mask_xyz = step(vec3(0.008856), f_cubed);
	vec3 xyz = mask_xyz * f_cubed + (1.0 - mask_xyz) * ((f - vec3(16.0 / 116.0)) / 7.787);
	xyz *= vec3(0.95047, 1.0, 1.08883);

	float r = xyz.x * 3.2406 + xyz.y * -1.5372 + xyz.z * -0.4986;
	float g = xyz.x * -0.9689 + xyz.y * 1.8758 + xyz.z * 0.0415;
	float b = xyz.x * 0.0557 + xyz.y * -0.2040 + xyz.z * 1.0570;
	vec3 linear_rgb = vec3(r, g, b);

	vec3 linear_gamma = linear_rgb * 12.92;
	vec3 non_linear_gamma = 1.055 * pow(max(linear_rgb, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
	vec3 mask_rgb = step(linear_rgb, vec3(0.0031308));
	vec3 srgb = mix(non_linear_gamma, linear_gamma, mask_rgb);

	return clamp(srgb, 0.0, 1.0);
}

void fragment() {
	vec3 source = textureLod(screen_texture, SCREEN_UV, 0.0).rgb;
	vec3 blurred = textureLod(screen_texture, SCREEN_UV, bloom_lod).rgb;

	vec3 oklch = rgb_to_oklch(source);
	oklch.x = posterize_step(oklch.x, float(lightness_steps));
	oklch.y = posterize_step(oklch.y, float(chroma_steps));
	oklch.z = round(oklch.z / hue_step_degrees) * hue_step_degrees;

	vec3 graded = oklch_to_rgb(oklch);
	vec3 palette_color = get_nearest_color(graded);
	vec3 result = mix(graded, palette_color, palette_mix);

	float vignette = smoothstep(0.92, 0.18, distance(SCREEN_UV, vec2(0.5)));
	float vertical_fog = smoothstep(0.15, 0.95, SCREEN_UV.y);
	float bright_mask = smoothstep(0.45, 0.95, max(max(blurred.r, blurred.g), blurred.b));

	result *= mix(1.0, vignette, vignette_strength);
	result = pow(result, vec3(shadow_crush));
	result = mix(result, fog_tint, fog_strength * vertical_fog);
	result += blurred * bright_mask * bloom_strength;

	COLOR = vec4(clamp(result, 0.0, 1.0), 1.0);
}
