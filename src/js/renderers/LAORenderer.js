import { WebGL } from '../WebGL.js';
import { AbstractRenderer } from './AbstractRenderer.js';

const [ SHADERS, MIXINS ] = await Promise.all([
    'shaders.json',
    'mixins.json',
].map(url => fetch(url).then(response => response.json())));

export class LAORenderer extends AbstractRenderer {

constructor(gl, volume, environmentTexture, options) {
    super(gl, volume, environmentTexture, options);

    this.registerProperties([
        {
            name: 'extinction',
            label: 'Extinction',
            type: 'spinner',
            value: 100,
            min: 0,
        },
        {
            name: 'localAmbientOcclusion',
            label: 'Local Ambient Occlusion',
            type: 'checkbox',
            checked: true,
        },
        {
            name: 'LAOWeight',
            label: 'LAO Weight',
            type: 'spinner',
            value: 0.69,
            min: 0,
            max: 1,
        },
        {
            name: 'numLAOSamples',
            label: '# of LAO Samples',
            type: 'spinner',
            value: 1,
            min: 1,
        },
        {
            name: 'LAOStepSize',
            label: 'LAO Stem Size',
            type: 'spinner',
            value: 0.05,
            min: 0,
        },
        {
            name: 'softShadows',
            label: 'Soft Shadows',
            type: 'checkbox',
            checked: true,
        },
        {
            name: 'shadowsWeight',
            label: 'Shadows Weight',
            type: 'spinner',
            value: 0.54,
            min: 0,
            max: 1,
        },
        {
            name: 'numShadowSamples',
            label: '# of Shadow Samples',
            type: 'spinner',
            value: 10,
            min: 1,
        },
        {
            name: 'lightRadious',
            label: 'Light Radious',
            type: 'spinner',
            value: 0.19,
            min: 0,
        },
        {
            name: 'light',
            label: 'Light position',
            type: 'vector',
            value: { x: 2.0, y: 12.0, z: 3.0 },
        },
        {
            name: 'lightCoeficient',
            label: 'Light Coeficient',
            type: 'spinner',
            value: 1.0,
            min: 0,
        },
        {
            name: 'slices',
            label: 'Slices',
            type: 'spinner',
            value: 64,
            min: 1,
        },
        {
            name: 'transferFunction',
            label: 'Transfer function',
            type: 'transfer-function',
            value: new Uint8Array(256),
        },
    ]);

    this.addEventListener('change', e => {
        const { name, value } = e.detail;

        if (name === 'transferFunction') {
            this.setTransferFunction(this.transferFunction);
        }

        if ([
            'extinction',
            'slices',
        ].includes(name)) {
            this.reset();
        }
    });

    this._programs = WebGL.buildPrograms(this._gl, SHADERS.renderers.LAO, MIXINS);
}

destroy() {
    const gl = this._gl;
    Object.keys(this._programs).forEach(programName => {
        gl.deleteProgram(this._programs[programName].program);
    });

    super.destroy();
}

_resetFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.reset;
    gl.useProgram(program);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_generateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.generate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, this._volume.getTexture());
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._transferFunction);

    gl.uniform1i(uniforms.uVolume, 0);
    gl.uniform1i(uniforms.uTransferFunction, 1);
    gl.uniform1f(uniforms.uStepSize, 1 / this.slices);
    gl.uniform1f(uniforms.uExtinction, this.extinction);
    gl.uniform1i(uniforms.uLocalAmbientOcclusion, this.localAmbientOcclusion);
    gl.uniform1f(uniforms.uLAOWeight, this.LAOWeight);
    gl.uniform1i(uniforms.uNumLAOSamples, this.numLAOSamples);
    gl.uniform1f(uniforms.uLAOStepSize, this.LAOStepSize);
    gl.uniform1i(uniforms.uSoftShadows, this.softShadows);
    gl.uniform1f(uniforms.uShadowsWeight, this.shadowsWeight);
    gl.uniform1i(uniforms.uNumShadowSamples, this.numShadowSamples);
    gl.uniform1f(uniforms.uLightRadious, this.lightRadious);
    gl.uniform1f(uniforms.uLightCoeficient, this.lightCoeficient);
    gl.uniform1f(uniforms.uOffset, Math.random());
    const mvpit = this.calculateMVPInverseTranspose();
    gl.uniformMatrix4fv(uniforms.uMvpInverseMatrix, false, mvpit.m);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_integrateFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.integrate;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this._frameBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);
    gl.uniform1i(uniforms.uFrame, 1);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_renderFrame() {
    const gl = this._gl;

    const { program, uniforms } = this._programs.render;
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._accumulationBuffer.getAttachments().color[0]);

    gl.uniform1i(uniforms.uAccumulator, 0);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

_getFrameBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE,
    }];
}

_getAccumulationBufferSpec() {
    const gl = this._gl;
    return [{
        width          : this._bufferSize,
        height         : this._bufferSize,
        min            : gl.NEAREST,
        mag            : gl.NEAREST,
        format         : gl.RGBA,
        internalFormat : gl.RGBA,
        type           : gl.UNSIGNED_BYTE,
    }];
}

}
