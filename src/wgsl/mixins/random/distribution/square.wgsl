// #part /wgsl/mixins/random/distribution/square

fn random_square(state: ptr<function, u32>) -> vec2f {
    let x: f32 = random_uniform(state);
    let y: f32 = random_uniform(state);
    return vec2f(x, y);
}
