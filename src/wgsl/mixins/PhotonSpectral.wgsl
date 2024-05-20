// #part /wgsl/mixins/PhotonSpectral

struct PhotonSpectral {
    position: vec3f, bounces: u32,
    direction: vec3f, samples: u32,
    transmittance: vec3f, bin: u32,
    radiance: vec3f,  wavelength: f32,
};
