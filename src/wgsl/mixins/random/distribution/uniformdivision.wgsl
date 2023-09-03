// #part /wgsl/mixins/random/distribution/uniformdivision

fn random_uniform(state: ptr<function, u32>) -> f32 {
    *state = hash(*state);
    return f32(*state) / f32(~0u);
}
