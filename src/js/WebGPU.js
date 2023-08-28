export class WebGPU {

/**
 * Create WebGPU buffer from a typed array
 * @param {GPUDevice} device 
 * @param {TypedArray} data 
 * @param {GPUBufferUsageFlags} usage
 * @returns {GPUBuffer}
 */
static createBuffer(device, data, usage) {
    let buffer = device.createBuffer({
        size: (data.byteLength + 3) & ~3,
        usage,
        mappedAtCreation: true
    });
    new data.constructor(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
}

static createTextureFromArray(device, size, format, bytesPerTexel, usage, data) {
    // TODO: Infer bytesPerTexel from format
    let texture = device.createTexture({
        size,
        format,
        usage
    })
    device.queue.writeTexture(
        { texture },
        data,
        {  bytesPerRow: size[0] * bytesPerTexel },
        size
    );
    return texture
}

/**
 * Insert mixins into shaders and build shader modules
 * @param {GPUDevice} device 
 * @param {Object<string, string>} shaders 
 * @param {Object<string, string>} mixins 
 * @returns {Objec<string, GPUShaderModule>}
 */
static buildShaderModules(device, shaders, mixins) {
    const cooked = {};
    for (const name in shaders) {
        cooked[name] = shaders[name].replace(/#include <(\S+)>/g, (_, path) => {
            let struct = mixins;
            for (const part of path.split('/')) {
                struct = struct[part];
            }
            return struct;
        });
    }

    const modules = {};
    for (const name in cooked) {
        try {
            const code = cooked[name];
            modules[name] = device.createShaderModule({ code });
        } catch (e) {
            e.message = `Error compiling and building ${name}:\n${e.message}`;
            throw e;
        }
    }

    return modules;
}

}
