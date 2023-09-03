// #part /wgsl/mixins/Photon

struct Photon {
    position: vec3f,
    direction: vec3f,
    transmittance: vec3f,
    radiance: vec3f,
    bounces: u32,
    samples: u32
};
