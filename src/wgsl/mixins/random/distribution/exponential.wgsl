// #part /wgsl/mixins/random/distribution/exponential

fn random_exponential(state: ptr<function, u32>, rate: f32) -> f32 {
    return -log(random_uniform(state)) / rate;
}
