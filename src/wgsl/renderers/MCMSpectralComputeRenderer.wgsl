// #part /wgsl/shaders/renderers/MCMSpectralCompute/render

override WORKGROUP_SIZE_X: u32;
override WORKGROUP_SIZE_Y: u32;

const EPS: f32 = 1e-5;

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    inverseResolution: vec2f,
    randSeed: f32,
    blur: f32,
    extinction: f32,
    anisotropy: f32,
    maxBounces: u32,
    steps: u32,
    light_direction: vec3f
};

@group(0) @binding(0) var uVolume: texture_3d<f32>;
@group(0) @binding(1) var uVolumeSampler: sampler;
@group(0) @binding(2) var uTransferFunction: texture_2d<f32>;
@group(0) @binding(3) var uTransferFunctionSampler: sampler;
@group(0) @binding(4) var uEnvironment: texture_2d<f32>;
@group(0) @binding(5) var uEnvironmentSampler: sampler;
@group(0) @binding(6) var uLightSpectrum: texture_2d<f32>;
@group(0) @binding(7) var uLightSpectrumSampler: sampler;

@group(0) @binding(8) var<uniform> uniforms: Uniforms;
@group(0) @binding(9) var<storage, read_write> uPhotons: array<PhotonSpectral>;
@group(0) @binding(10) var uRadiance: texture_storage_2d<rgba16float, write>;
@group(0) @binding(11) var<storage, read> spectrum_representation: array<f32, 64>;


#include <intersectCube>

#include <constants>
#include <random/hash/pcg>
#include <random/hash/squashlinear>
#include <random/distribution/uniformdivision>
#include <random/distribution/square>
#include <random/distribution/disk>
#include <random/distribution/sphere>
#include <random/distribution/exponential>

#include <unprojectRand>
#include <PhotonSpectral>

fn sample_environment_map(d: vec3f, wavelength: f32) -> f32 {
    let texCoord: vec2f = vec2f(atan2(d.x, -d.z), asin(-d.y) * 2.0) * INVPI * 0.5 + 0.5; // TODO: Why shouldn't y be negated here?
    let gain = 2.7; // make the environment map brighter
    let color = textureSampleLevel(uEnvironment, uEnvironmentSampler, texCoord, 0.0) * gain;
    if (wavelength < 500.0) {
        return color.b;
    } else if (wavelength < 600.0) {
        return color.g;
    } else {
        return color.r;
    }
}

fn sample_light(d: vec3f, wavelength: f32) -> f32 {

    let t = (wavelength - 400.0) / (700.0 - 400.0);
    let intensity = f32(textureSampleLevel(uLightSpectrum, uLightSpectrumSampler, vec2f(t, 0.5), 0.0).r) * 5.0;
    if length(uniforms.light_direction) < EPS {
        return intensity;
    }
    else{
        let light_dir = normalize(uniforms.light_direction);
        return max(dot(d.xyz, light_dir)*intensity, 0.0);
    }
}

fn sample_volume_color(position: vec3f, wavelength: f32) -> vec2f {
    let d = textureSampleLevel(uVolume, uVolumeSampler, position, 0.0).r;
    let t = (wavelength - 400.0) / (700.0 - 400.0);
    let sample = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, vec2f(t, d), 0.0); 
    return sample.rg;
}

fn sampleHenyeyGreensteinAngleCosine(state: ptr<function, u32>, g: f32) -> f32 {
    let g2: f32 = g * g;
    let c: f32 = (1.0 - g2) / (1.0 - g + 2.0 * g * random_uniform(state));
    return (1.0 + g2 - c * c) / (2.0 * g);
}

fn sampleHenyeyGreenstein(state: ptr<function, u32>, g: f32, direction: vec3f) -> vec3f {
    // Generate random direction and adjust it so that the angle is HG-sampled
    let u: vec3f = random_sphere(state);
    if (abs(g) < EPS) {
        return u;
    }
    let hgcos: f32 = sampleHenyeyGreensteinAngleCosine(state, g);
    let circle: vec3f = normalize(u - dot(u, direction) * direction);
    return sqrt(1.0 - hgcos * hgcos) * circle + hgcos * direction;
}

fn max3(v: vec3f) -> f32 {
    return max(max(v.x, v.y), v.z);
}

fn mean3(v: vec3f) -> f32 {
    return dot(v, vec3f(1.0 / 3.0));
}

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn compute_main(
    @builtin(global_invocation_id) globalId : vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    let globalSize: vec3u = vec3u(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1u) * numWorkgroups;
    let globalIndex: u32 = globalId.x + globalId.y * globalSize.x;
    if (globalIndex > arrayLength(&uPhotons)) {
        return;
    }

    let screenPosition: vec2f = ((vec2f(globalId.xy) + 0.5) * uniforms.inverseResolution - 0.5) * vec2f(2.0, -2.0); // TODO: Double check this

    var p: PhotonSpectral = uPhotons[globalIndex];

    var state: u32 = hash3(vec3u(globalId.x, globalId.y, bitcast<u32>(uniforms.randSeed)));
    for (var i: u32 = 0u; i < uniforms.steps; i++) {
        let dist: f32 = random_exponential(&state, uniforms.extinction);
        p.position += dist * p.direction;

        let volumeSample: vec2f = sample_volume_color(p.position, p.wavelength);
        let volume_alebedo: f32 = volumeSample.x;
        let volume_alpha: f32 = volumeSample.y; // true extinction

        let PNull: f32 = 1.0 - volume_alpha;
        var PScattering: f32;
        if (p.bounces >= uniforms.maxBounces) {
            PScattering = 0.0;
        } else {
            PScattering = volume_alpha * volume_alebedo;
        }
        let PAbsorption: f32 = 1.0 - PNull - PScattering;

        // var PNull: f32;
        // var PScattering: f32;
        // if p.wavelength < 550.0 {
        //     PScattering = 1.0;
        //     PNull = 0.0;
        // } else if p.wavelength < 700{
        //     PScattering = 0;
        //     PNull = 1.0;
        // }
        // if (p.bounces >= uniforms.maxBounces) {
        //     PScattering = 0.0;
        // }
        // let PAbsorption: f32 = 1.0 - PNull - PScattering;

        let fortuneWheel: f32 = random_uniform(&state);
        if (any(p.position > vec3f(1.0)) || any(p.position < vec3f(0.0))) {
            // Out of bounds
            // let envSample: f32 = sample_environment_map(p.direction, p.wavelength);
            // let envSample: f32 = sample_light(p.direction, p.wavelength);
            // let radiance: f32 = p.transmittance[p.bin] * envSample;
            let radiance: f32 = sample_light(p.direction, p.wavelength); // transmitance is not needed as we are dealing with only one wavelength at a time
            p.samples++;
            PhotonSpectral_add_radiance(&p, radiance);
            PhotonSpectral_reset(&p, screenPosition, &state);
        } else if (fortuneWheel < PAbsorption) {
            // Absorption
            p.samples++;
            PhotonSpectral_add_radiance(&p, 0.0);
            PhotonSpectral_reset(&p, screenPosition, &state);
        } else if (fortuneWheel < PAbsorption + PScattering) {
            // Scattering
            // p.transmittance[p.bin] *= volume_alebedo;
            p.direction = sampleHenyeyGreenstein(&state, uniforms.anisotropy, p.direction);
            p.bounces++;
        } else {
            // Null collision
        }
    }
    uPhotons[globalIndex] = p;

    let radiance_rgb = PhotonSpectral_radiance_to_rgb(&p);
    textureStore(uRadiance, globalId.xy, vec4f(radiance_rgb, 1.0));

    // debugging light spectrum texture
    // if globalId.x < 10 {
    //     let v = textureSampleLevel(uLightSpectrum, uLightSpectrumSampler, vec2f(f32(globalId.y) / 512.0 , 0.5), 0.0).r;
    //     textureStore(uRadiance, globalId.xy, vec4f(v, v, v, 1.0));
    // }

    // debugging transfer function texture
    // let pos = vec2f(globalId.xy) / 512.0;
    // let v = textureSampleLevel(uTransferFunction, uTransferFunctionSampler, pos, 0.0).r;
    // textureStore(uRadiance, globalId.xy, vec4f(v, v, v, 1.0));
    
    // Phony assignments to avoid unused variable errors
    _ = uEnvironmentSampler;
    _ = uEnvironment;
    _ = uVolume;
    _ = uVolumeSampler;
    _ = uTransferFunction;
    _ = uTransferFunctionSampler;
    _ = uLightSpectrum;
    _ = uLightSpectrumSampler;
}


// #part /wgsl/shaders/renderers/MCMSpectralCompute/reset

override WORKGROUP_SIZE_X: u32;
override WORKGROUP_SIZE_Y: u32;

struct Uniforms {
    mvpInverseMatrix: mat4x4f,
    inverseResolution: vec2f,
    randSeed: f32,
    blur: f32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> uPhotons: array<PhotonSpectral>; // TODO: Check if it's possible to use read only
@group(0) @binding(2) var<storage, read> spectrum_representation: array<f32, 64>;


#include <intersectCube>

#include <constants>
#include <random/hash/pcg>
#include <random/hash/squashlinear>
#include <random/distribution/uniformdivision>
#include <random/distribution/square>
#include <random/distribution/disk>
#include <random/distribution/sphere>
#include <random/distribution/exponential>

#include <unprojectRand>
#include <PhotonSpectral>

@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y)
fn compute_main(
    @builtin(global_invocation_id) globalId : vec3u,
    @builtin(num_workgroups) numWorkgroups: vec3u
) {
    let globalSize: vec3u = vec3u(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1u) * numWorkgroups;
    let globalIndex: u32 = globalId.x + globalId.y * globalSize.x;
    if (globalIndex > arrayLength(&uPhotons)) {
        return;
    }
    
    let screenPosition: vec2f = ((vec2f(globalId.xy) + 0.5) * uniforms.inverseResolution - 0.5) * vec2f(2.0, -2.0); // TODO: Double check this
    
    var photon: PhotonSpectral;
    var state: u32 = hash3(vec3u(globalId.x, globalId.y, bitcast<u32>(uniforms.randSeed)));
    PhotonSpectral_full_reset(&photon, screenPosition, &state);

    uPhotons[globalIndex] = photon;
}


// #part /wgsl/mixins/PhotonSpectral

const MAX_N_BINS = 12;

struct PhotonSpectral {
    position: vec3f, 
    bounces: u32,
    direction: vec3f, 
    samples: u32,
    bin: u32, 
    wavelength: f32,
    radiance: array<f32, MAX_N_BINS>, 
    transmittance: array<f32, MAX_N_BINS>,
};

fn PhotonSpectral_reset(photon: ptr<function, PhotonSpectral>, screenPosition: vec2f, state: ptr<function, u32>) {
    var fromPos: vec3f;
    var toPos: vec3f;
    unprojectRand(state, screenPosition, uniforms.mvpInverseMatrix, uniforms.inverseResolution, uniforms.blur, &fromPos, &toPos);
    (*photon).direction = normalize(toPos - fromPos);
    (*photon).bounces = 0u;
    var tbounds: vec2f = max(intersectCube(fromPos, (*photon).direction), vec2f(0.0));
    (*photon).position = fromPos + tbounds.x * (*photon).direction;
    for (var i: u32 = 0u; i < MAX_N_BINS; i++) {
        (*photon).transmittance[i] = 1.0;
    }

    let n_bins = u32(spectrum_representation[0] + 0.5);
    let min_lam = spectrum_representation[1];
    let max_lam = spectrum_representation[n_bins + 1];

    PhotonSpectral_set_wavelength(photon, random_uniform(state) * (max_lam - min_lam) + min_lam);
}

fn PhotonSpectral_full_reset(photon: ptr<function, PhotonSpectral>, screenPosition: vec2f, state: ptr<function, u32>) {
    PhotonSpectral_reset(photon, screenPosition, state);
    (*photon).samples = 0u;
    for (var i: u32 = 0u; i < MAX_N_BINS; i++){
        (*photon).radiance[i] = 1.0;
    }
}

fn PhotonSpectral_set_wavelength(photon: ptr<function, PhotonSpectral>, wavelength: f32) {
    (*photon).wavelength = wavelength;

    let n_bins = u32(spectrum_representation[0] + 0.5);
    let min_lam = spectrum_representation[1];
    let max_lam = spectrum_representation[n_bins + 1];

    (*photon).bin = n_bins - 1u;
    for (var i: u32 = 1u; i < n_bins; i++) {
        if wavelength < spectrum_representation[i + 1] {
            (*photon).bin = i - 1u;
            break;
        }
    }
}

fn PhotonSpectral_add_radiance(photon: ptr<function, PhotonSpectral>, radiance: f32) {
    let n_bins = u32(spectrum_representation[0] + 0.5);
    for(var i: u32 = 0u; i < n_bins; i++) {
        if (i == (*photon).bin) {
            (*photon).radiance[i] += (radiance - (*photon).radiance[i]) / f32((*photon).samples);
        }
        else{
            (*photon).radiance[i] += (0.0 - (*photon).radiance[i]) / f32((*photon).samples);
        }
    }
}

fn PhotonSpectral_radiance_to_xyz(photon: ptr<function, PhotonSpectral>) -> vec3f {
    let n_bins = u32(spectrum_representation[0] + 0.5);

    var radiance_xyz: vec3f = vec3f(0.0);
    for (var i: u32 = 0u; i < n_bins; i++){
        radiance_xyz += photon.radiance[i] * vec3f(
            spectrum_representation[2+n_bins+i],   // x
            spectrum_representation[2+2*n_bins+i], // y
            spectrum_representation[2+3*n_bins+i]  // z
        ); 
    }

    return radiance_xyz;
}

fn PhotonSpectral_radiance_to_rgb(photon: ptr<function, PhotonSpectral>) -> vec3f {
    let radiance_xyz: vec3f = PhotonSpectral_radiance_to_xyz(photon);
    return vec3f(
        3.240479 * radiance_xyz.x - 1.537150 * radiance_xyz.y - 0.498536 * radiance_xyz.z,
        -0.969255 * radiance_xyz.x + 1.875990 * radiance_xyz.y + 0.041556 * radiance_xyz.z,
        0.055647 * radiance_xyz.x - 0.204041 * radiance_xyz.y + 1.057311 * radiance_xyz.z
    );
}