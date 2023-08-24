// #part /wgsl/shaders/renderers/EAM/generate

diagnostic(off, derivative_uniformity);

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) rayFrom: vec3<f32>,
    @location(1) rayTo: vec3<f32>
};

struct Uniforms {
    mvpInverseMatrix: mat4x4<f32>,
    stepSize: f32,
    offset: f32,
    extinction: f32
};

@group(0) @binding(0) var uVolumeSampler: sampler;
@group(0) @binding(1) var uVolume: texture_3d<f32>;
@group(0) @binding(2) var uTransferFunctionSampler: sampler;
@group(0) @binding(3) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(4) var<uniform> uniforms: Uniforms;

const vertices = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
);

@vertex
fn main_vs(@builtin(vertex_index) vertexIndex : u32) -> VSOut  {
    var position: vec2<f32> = vertices[vertexIndex];

    // TODO: Link unproject
    var nearPosition = vec4<f32>(position, -1.0, 1.0);
    var farPosition = vec4<f32>(position, 1.0, 1.0);
    var fromDirty: vec4<f32> = uniforms.mvpInverseMatrix * nearPosition;
    var toDirty: vec4<f32> = uniforms.mvpInverseMatrix * farPosition;

    var vsOut : VSOut;
    vsOut.position = vec4<f32>(position, 0.0, 1.0);
    vsOut.rayFrom = fromDirty.xyz / fromDirty.w;
    vsOut.rayTo = toDirty.xyz / toDirty.w;
    return vsOut;
}

// TODO: Link intersectCube
fn intersectCube(origin: vec3<f32>, direction: vec3<f32>) -> vec2<f32> {
	var tmin: vec3<f32> = (vec3<f32>(0.0) - origin) / direction;
	var tmax: vec3<f32> = (vec3<f32>(1.0) - origin) / direction;
	var t1: vec3<f32> = min(tmin, tmax);
	var t2: vec3<f32> = max(tmin, tmax);
	var tnear: f32 = max(max(t1.x, t1.y), t1.z);
	var tfar: f32 = min(min(t2.x, t2.y), t2.z);
	return vec2<f32>(tnear, tfar);
}

fn sampleVolumeColor(position: vec3<f32>) -> vec4<f32> {
    var volumeSample: vec2<f32> = textureSample(uVolume, uVolumeSampler, position).rg;
    var transferSample: vec4<f32> = textureSample(uTransferFunction, uTransferFunctionSampler, volumeSample);
    return transferSample;
}

@fragment
fn main_fs(@location(0) rayFrom: vec3<f32>, @location(1) rayTo: vec3<f32>) -> @location(0) vec4<f32> {
    var rayDirection: vec3<f32> = rayTo - rayFrom;
    var tbounds: vec2<f32> = max(intersectCube(rayFrom, rayDirection), vec2<f32>(0.0));

    if (tbounds.x >= tbounds.y) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }
    
    var fromVal: vec3<f32> = mix(rayFrom, rayTo, tbounds.x);
    var toVal: vec3<f32> = mix(rayFrom, rayTo, tbounds.y);

    var rayStepLength: f32 = distance(fromVal, toVal) * uniforms.stepSize;

    var t: f32 = 0.0; // uniforms.stepSize * uniforms.offset;
    var accumulator = vec4<f32>(0.0);

    while (t < 1.0 /*&& accumulator.a < 0.99*/) {
        var position: vec3<f32> = mix(fromVal, toVal, t);
        var colorSample = sampleVolumeColor(position);
        colorSample.a *= rayStepLength * uniforms.extinction;
        colorSample = vec4<f32>(colorSample.rgb * colorSample.a, colorSample.a);
        accumulator += (1.0 - accumulator.a) * colorSample;
        t += 0.01; // uniforms.stepSize;
    }

    if (accumulator.a > 1.0) {
        accumulator = vec4<f32>(accumulator.rgb / accumulator.a, accumulator.a);
    }

    return vec4<f32>(accumulator.rgb, 1.0);
}


// #part /wgsl/shaders/renderers/EAM/integrate

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@group(0) @binding(0) var uAccumulatorSampler: sampler;
@group(0) @binding(1) var uAccumulator: texture_2d<f32>;
@group(0) @binding(2) var uFrameSampler: sampler;
@group(0) @binding(3) var uFrame: texture_2d<f32>;
@group(0) @binding(4) var<uniform> uMix: f32;

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
    vsOut.uv = position * 0.5 + 0.5;
    return vsOut;
}

@fragment
fn main_fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    var accumulator = textureSample(uAccumulator, uAccumulatorSampler, uv);
    var frame = textureSample(uFrame, uFrameSampler, uv);
    return mix(accumulator, frame, uMix);
}


// #part /wgsl/shaders/renderers/EAM/render

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@group(0) @binding(0) var uAccumulatorSampler: sampler;
@group(0) @binding(1) var uAccumulator: texture_2d<f32>;

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
    vsOut.uv = position * 0.5 + 0.5;
    return vsOut;
}

@fragment
fn main_fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(uAccumulator, uAccumulatorSampler, uv);
}


// #part /wgsl/shaders/renderers/EAM/reset

const vertices = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
);

@vertex
fn main_vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4<f32>  {
    return vec4<f32>(vertices[vertexIndex], 0.0, 1.0);
}

@fragment
fn main_fs() -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
