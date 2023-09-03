// #part /wgsl/mixins/random/hash/squashlinear

fn hash2(x: vec2u) -> u32 {
    return hash(19u * x.x + 47u * x.y + 101u);
}

fn hash3(x: vec3u) -> u32 {
    return hash(19u * x.x + 47u * x.y + 101u * x.z + 131u);
}

fn hash4(x: vec4u) -> u32 {
    return hash(19u * x.x + 47u * x.y + 101u * x.z + 131u * x.w + 173u);
}
