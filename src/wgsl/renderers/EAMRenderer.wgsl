// #part /wgsl/shaders/renderers/EAM/generate

diagnostic(off, derivative_uniformity);

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) rayFrom: vec3f,
    @location(1) rayTo: vec3f
};

struct Uniforms {
    mvpInverseMatrix: mat4x4<f32>,
    stepSize: f32,
    offset: f32,
    extinction: f32
};

@group(0) @binding(0) var uVolume: texture_3d<f32>;
@group(0) @binding(1) var uVolumeSampler: sampler;
@group(0) @binding(2) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(3) var uTransferFunctionSampler: sampler;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    var vertex: vec2f = vertices[vertexIndex];

    // TODO: Link unproject
    var nearPosition = vec4f(vertex, -1.0, 1.0);
    var farPosition = vec4f(vertex, 1.0, 1.0);
    var fromDirty: vec4f = uniforms.mvpInverseMatrix * nearPosition;
    var toDirty: vec4f = uniforms.mvpInverseMatrix * farPosition;

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.rayFrom = fromDirty.xyz / fromDirty.w;
    vertexOut.rayTo = toDirty.xyz / toDirty.w;
    return vertexOut;
}

// TODO: Link intersectCube
fn intersectCube(origin: vec3f, direction: vec3f) -> vec2f {
	var tmin: vec3f = (vec3f(0.0) - origin) / direction;
	var tmax: vec3f = (vec3f(1.0) - origin) / direction;
	var t1: vec3f = min(tmin, tmax);
	var t2: vec3f = max(tmin, tmax);
	var tnear: f32 = max(max(t1.x, t1.y), t1.z);
	var tfar: f32 = min(min(t2.x, t2.y), t2.z);
	return vec2f(tnear, tfar);
}

fn sampleVolumeColor(position: vec3f) -> vec4f {
    var volumeSample: vec2f = textureSample(uVolume, uVolumeSampler, position).rg;
    var transferSample: vec4f = textureSample(uTransferFunction, uTransferFunctionSampler, volumeSample);
    return transferSample;
}

@fragment
fn fragment_main(@location(0) rayFrom: vec3f, @location(1) rayTo: vec3f) -> @location(0) vec4f {
    var rayDirection: vec3f = rayTo - rayFrom;
    var tbounds: vec2f = max(intersectCube(rayFrom, rayDirection), vec2f(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4f(0.0, 0.0, 0.0, 1.0);
    }
    
    var fromVal: vec3f = mix(rayFrom, rayTo, tbounds.x);
    var toVal: vec3f = mix(rayFrom, rayTo, tbounds.y);

    var rayStepLength: f32 = distance(fromVal, toVal) * uniforms.stepSize;

    var t: f32 = 0.0; // uniforms.stepSize * uniforms.offset;
    var accumulator = vec4f(0.0);

    while (t < 1.0 /*&& accumulator.a < 0.99*/) {
        var position: vec3f = mix(fromVal, toVal, t);
        var colorSample = sampleVolumeColor(position);
        colorSample.a *= rayStepLength * uniforms.extinction;
        colorSample = vec4f(colorSample.rgb * colorSample.a, colorSample.a);
        accumulator += (1.0 - accumulator.a) * colorSample;
        t += 0.01; // uniforms.stepSize;
    }

    if (accumulator.a > 1.0) {
        accumulator = vec4f(accumulator.rgb / accumulator.a, accumulator.a);
    }

    return vec4f(accumulator.rgb, 1.0);
}


// #part /wgsl/shaders/renderers/EAM/integrate

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@group(0) @binding(0) var uAccumulator: texture_2d<f32>;
@group(0) @binding(1) var uAccumulatorSampler: sampler;
@group(0) @binding(2) var uFrame: texture_2d<f32>;
@group(0) @binding(3) var uFrameSampler: sampler;
@group(0) @binding(4) var<uniform> uMix: f32;

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    var vertex: vec2f = vertices[vertexIndex];

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.uv = vertex * vec2f(0.5, -0.5) + 0.5;
    return vertexOut;
}

@fragment
fn fragment_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    var accumulator = textureSample(uAccumulator, uAccumulatorSampler, uv);
    var frame = textureSample(uFrame, uFrameSampler, uv);
    return mix(accumulator, frame, uMix);
}


// #part /wgsl/shaders/renderers/EAM/render

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f
}

@group(0) @binding(0) var uAccumulator: texture_2d<f32>;
@group(0) @binding(1) var uAccumulatorSampler: sampler;

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOut  {
    var vertex: vec2f = vertices[vertexIndex];

    var vertexOut : VertexOut;
    vertexOut.position = vec4f(vertex, 0.0, 1.0);
    vertexOut.uv = vertex * vec2f(0.5, -0.5) + 0.5;
    return vertexOut;
}

@fragment
fn fragment_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return textureSample(uAccumulator, uAccumulatorSampler, uv);
}


// #part /wgsl/shaders/renderers/EAM/reset

const vertices = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
);

@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f  {
    return vec4f(vertices[vertexIndex], 0.0, 1.0);
}

@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4f(0.0, 0.0, 0.0, 1.0);
}
