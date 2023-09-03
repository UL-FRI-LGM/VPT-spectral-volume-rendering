// #part /wgsl/mixins/random/distribution/sphere

// Marsaglia (1972)
fn random_sphere(state: ptr<function, u32>) -> vec3f {
    let disk: vec2f = random_disk(state);
    let norm: f32 = dot(disk, disk);
    let radius: f32 = 2.0 * sqrt(1.0 - norm);
    let z: f32 = 1.0 - 2.0 * norm;
    return vec3f(radius * disk, z);
}
