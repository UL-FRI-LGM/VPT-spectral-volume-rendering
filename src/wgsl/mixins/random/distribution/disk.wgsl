// #part /wgsl/mixins/random/distribution/disk

fn random_disk(state: ptr<function, u32>) -> vec2f {
    let radius: f32 = sqrt(random_uniform(state));
    let angle: f32 = TWOPI * random_uniform(state);
    return radius * vec2f(cos(angle), sin(angle));
}
