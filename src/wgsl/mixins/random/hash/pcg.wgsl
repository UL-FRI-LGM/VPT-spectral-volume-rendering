// #part /wgsl/mixins/random/hash/pcg

fn hash(val: u32) -> u32 {
    var x: u32 = val * 747796405u + 2891336453u;
    x = ((x >> ((x >> 28u) + 4u)) ^ x) * 277803737u;
    return (x >> 22u) ^ x;
}
