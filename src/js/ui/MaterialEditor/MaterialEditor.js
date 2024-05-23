import { DOMUtils } from '../../utils/DOMUtils.js';


const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./MaterialEditor.html', import.meta.url))
    .then(response => response.text());

export class MaterialEditor extends HTMLElement {

	constructor() {
		super();
		this.shadow = this.attachShadow({ mode: 'open' });
		this.shadow.appendChild(template.content.cloneNode(true));
		this.binds = DOMUtils.bind(this.shadow);

		this._albedo = new Uint8Array(256).fill(127);
		this._alpha = new Uint8Array(256).fill(127);
		this._anisotropy = new Uint8Array(256).fill(127);

		this.binds.albedo.addEventListener('change', e => {
			this._albedo = this.binds.albedo.value;
			this.dispatchEvent(new Event('change'));
		});

		this.binds.alpha.addEventListener('change', e => {
			this._alpha = this.binds.alpha.value;
			this.dispatchEvent(new Event('change'));
		});

		this.binds.anisotropy.addEventListener('change', e => {
			this._anisotropy = this.binds.anisotropy.value;
			this.dispatchEvent(new Event('change'));
		});
	}

	get albedo(){
		return this._albedo;
	}

	set albedo(value){
		this._albedo = value;
		this.binds.albedo.value = value;
	}

	get alpha(){
		return this._alpha;
	}

	set alpha(value){
		this._alpha = value;
		this.binds.alpha.value = value;
	}

	get anisotropy(){
		return this._anisotropy;
	}

	set anisotropy(value){
		this._anisotropy = value;
		this.binds.anisotropy.value = value;
	}
}

customElements.define('ui-material-editor', MaterialEditor);
