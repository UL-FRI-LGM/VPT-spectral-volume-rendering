// #part /wgsl/shaders/quad

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var uTexture: texture_2d<f32>;

const vertices = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
);

@vertex
fn main_vs(@builtin(vertex_index) vertexIndex : u32) -> VSOut  {
    var position: vec2<f32> = vertices[vertexIndex];

    var vsOut : VSOut;
    vsOut.position = vec4<f32>(position, 0.0, 1.0);
    vsOut.uv = position * vec2<f32>(0.5, -0.5) + 0.5;
    return vsOut;
}

@fragment
fn main_fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uTexture, uSampler, uv);
}
