// #part /wgsl/mixins/Photon

struct Photon {
    position: vec3f,
    bounces: u32,
    direction: vec3f,
    samples: u32,
    transmittance: vec3f,
    radiance: vec3f
};
