import { WebGPU } from './WebGPU.js';
import { Ticker } from './Ticker.js';

import { Node } from './Node.js';
import { PerspectiveCamera } from './PerspectiveCamera.js';
import { WebGPUVolume } from './WebGPUVolume.js';

import { WebGPURendererFactory } from './renderers/WebGPURendererFactory.js';
import { ToneMapperFactory } from './tonemappers/ToneMapperFactory.js';

import { CircleAnimator } from './animators/CircleAnimator.js';
import { OrbitCameraAnimator } from './animators/OrbitCameraAnimator.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders-wgsl.json',
    'mixins-wgsl.json',
].map(url => fetch(url).then(response => response.json())));

export class WebGPURenderingContext extends EventTarget {

constructor(onInitialized, options = {}) {
    super();

    this.render = this.render.bind(this);

    this.canvas = document.createElement('canvas');

    this.initWebGPU().then(() => {
        this.volume = new WebGPUVolume(this.device);
        onInitialized();
    });

    this.resolution = options.resolution ?? 512;
    this.filter = options.filter ?? 'linear';

    this.camera = new Node();
    this.camera.transform.localTranslation = [0, 0, 2];
    this.camera.components.push(new PerspectiveCamera(this.camera));

    this.camera.transform.addEventListener('change', e => {
        if (this.renderer) {
            this.renderer.reset();
        }
    });

    //this.cameraAnimator = new CircleAnimator(this.camera, {
    //    center: [0, 0, 2],
    //    direction: [0, 0, 1],
    //    radius: 0.01,
    //    frequency: 1,
    //});
    this.cameraAnimator = new OrbitCameraAnimator(this.camera, this.canvas);

    // this.volume = new WebGPUVolume(this.gl);
}

// ============================ WEBGL SUBSYSTEM ============================ //

async initWebGPU() {
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported");
    }

    this.adapter = await navigator.gpu.requestAdapter();
    this.device = await this.adapter.requestDevice();
    const device = this.device;

    this.context = this.canvas.getContext("webgpu");
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
        device,
        format: this.canvasFormat
    });

    const module = device.createShaderModule({ code: SHADERS.quad });
    this.pipeline = device.createRenderPipeline({
        label: "WebGPURenderingContext render pipeline",
        layout: "auto",
        vertex: {
            module,
            entryPoint: "vertex_main"
        },
        fragment: {
            module,
            entryPoint: "fragment_main",
            targets: [{ format: this.canvasFormat }]
        }
    });

    this.sampler = device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest"
    });

    return; // TODO

    const contextSettings = {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: true,
    };

    this.contextRestorable = true;

    this.gl = this.canvas.getContext('webgl2', contextSettings);
    const gl = this.gl;

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.environmentTexture = WebGL.createTexture(gl, {
        width   : 1,
        height  : 1,
        data    : new Uint8Array([255, 255, 255, 255]),
        format  : gl.RGBA,
        iformat : gl.RGBA, // TODO: HDRI & OpenEXR support
        type    : gl.UNSIGNED_BYTE,
        wrapS   : gl.CLAMP_TO_EDGE,
        wrapT   : gl.CLAMP_TO_EDGE,
        min     : gl.LINEAR,
        max     : gl.LINEAR,
    });

    this.program = WebGL.buildPrograms(gl, {
        quad: SHADERS.quad
    }, MIXINS).quad;
}

resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.getComponent(PerspectiveCamera).aspect = width / height;
}

async setVolume(reader) {
    this.volume = new WebGPUVolume(this.device, reader);
    this.volume.addEventListener('progress', e => {
        this.dispatchEvent(new CustomEvent('progress', { detail: e.detail }));
    });
    await this.volume.load();
    this.volume.setFilter(this.filter);
    if (this.renderer) {
        this.renderer.setVolume(this.volume);
    }
}

setEnvironmentMap(image) {
    throw new Error("Not implemented");
}

setFilter(filter) {
    this.filter = filter;
    if (this.volume) {
        this.volume.setFilter(filter);
        if (this.renderer) {
            this.renderer.reset();
        }
    }
}

chooseRenderer(renderer) {
    if (this.renderer) {
        this.renderer.destroy();
    }
    const rendererClass = WebGPURendererFactory(renderer);
    this.renderer = new rendererClass(this.device, this.volume, this.camera, this.environmentTexture, {
        resolution: this.resolution,
    });
    this.renderer.reset();
    if (this.toneMapper) {
        this.toneMapper.setTexture(this.renderer.getTexture());
    }
    this.isTransformationDirty = true;
}

chooseToneMapper(toneMapper) {
    throw new Error("Not implemented");
}

render() {
    const device = this.device;
    if (!device || !this.renderer /*|| !this.toneMapper*/) {
        return;
    }

    this.renderer.render();
    // this.toneMapper.render();

    const bindGroup = device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: this.renderer.getTexture().createView()
            },
            {
                binding: 1,
                resource: this.sampler
            },
        ]
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0],
                loadOp: "clear",
                storeOp: "store"
            }
        ]
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    return;

    const gl = this.gl;
    if (!gl || !this.renderer || !this.toneMapper) {
        return;
    }

    this.renderer.render();
    this.toneMapper.render();

    const { program, uniforms } = this.program;
    gl.useProgram(program);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.toneMapper.getTexture());
    gl.uniform1i(uniforms.uTexture, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
}

get resolution() {
    return this._resolution;
}

set resolution(resolution) {
    this._resolution = resolution;
    this.canvas.width = resolution;
    this.canvas.height = resolution;
    if (this.renderer) {
        this.renderer.setResolution(resolution);
    }
    if (this.toneMapper) {
        this.toneMapper.setResolution(resolution);
        if (this.renderer) {
            this.toneMapper.setTexture(this.renderer.getTexture());
        }
    }
}

async recordAnimation(options = {}) {
    throw new Error("Not implemented");
}

startRendering() {
    Ticker.add(this.render);
}

stopRendering() {
    Ticker.remove(this.render);
}

}
