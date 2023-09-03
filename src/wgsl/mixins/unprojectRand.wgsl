// #part /wgsl/mixins/unprojectRand

fn unprojectRand(
        state: ptr<function, u32>,
        position: vec2f,
        inverseMvp: mat4x4f,
        inverseResolution: vec2f,
        blur: f32,
        outFrom: ptr<function, vec3f>,
        outTo: ptr<function, vec3f>
) {
    // Sample a disk on the near plane (depth of field)
    let offset: vec2f = random_disk(state) * blur;
    let nearPosition: vec4f = vec4f(position + offset, -1.0, 1.0);

    // Sample a square on the far plane (antialiasing)
    let antialiasing: vec2f = (random_square(state) * 2.0 - 1.0) * inverseResolution;
    let farPosition: vec4f = vec4f(position + antialiasing, 1.0, 1.0);

    // Map to world space
    let fromDirty: vec4f = inverseMvp * nearPosition;
    let toDirty: vec4f = inverseMvp * farPosition;
    *outFrom = fromDirty.xyz / fromDirty.w;
    *outTo = toDirty.xyz / toDirty.w;
}
