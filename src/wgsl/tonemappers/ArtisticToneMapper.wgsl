// #part /wgsl/shaders/tonemappers/ArtisticToneMapper/render

const M_PI: f32 = 3.1415926535897932384626;

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

struct Uniforms {
    low: f32,
    mid: f32,
    high: f32,
    saturation: f32,
    gamma: f32
};

@group(0) @binding(0) var uTexture: texture_2d<f32>;
@group(0) @binding(1) var uTextureSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    let vertex: vec2f = vertices[vertexIndex];

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.uv = vertex * vec2f(0.5, -0.5) + 0.5;
    return vertexOut;
}

@fragment
fn fragment_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    var color: vec4f = textureSample(uTexture, uTextureSampler, uv);
    color = (color - uniforms.low) / (uniforms.high - uniforms.low);
    let gray: vec3f = normalize(vec3f(1.0));
    color = vec4f(mix(dot(color.rgb, gray) * gray, color.rgb, uniforms.saturation), 1.0);
    let midpoint: f32 = (uniforms.mid - uniforms.low) / (uniforms.high - uniforms.low);
    let exponent: f32 = -log(midpoint) / log(2.0);
    color = pow(color, vec4(exponent / uniforms.gamma));
    return vec4f(color.rgb, 1.0);
}
