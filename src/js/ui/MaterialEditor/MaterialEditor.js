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
	}
}

customElements.define('ui-material-editor', MaterialEditor);
