// #part /wgsl/mixins/unproject

fn unproject(position: vec2f, inverseMvp: mat4x4f, outFrom: ptr<function, vec3f>, outTo: ptr<function, vec3f>) {
    var nearPosition = vec4f(position, -1.0, 1.0);
    var farPosition = vec4f(position, 1.0, 1.0);
    var fromDirty: vec4f = inverseMvp * nearPosition;
    var toDirty: vec4f = inverseMvp * farPosition;
    *outFrom = fromDirty.xyz / fromDirty.w;
    *outTo = toDirty.xyz / toDirty.w;
}
