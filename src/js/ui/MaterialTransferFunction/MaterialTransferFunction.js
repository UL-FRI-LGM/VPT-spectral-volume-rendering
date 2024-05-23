import { DOMUtils } from '../../utils/DOMUtils.js';
import { spectrum_to_RGB, spectrum_to_XYZ } from '../../utils/Spectrum.js';

const template = document.createElement('template');
template.innerHTML = await fetch(new URL('./MaterialTransferFunction.html', import.meta.url))
    .then(response => response.text());

export class MaterialTransferFunction extends HTMLElement {

	constructor() {
		super();
		this.shadow = this.attachShadow({ mode: 'open' });
		this.shadow.appendChild(template.content.cloneNode(true));
		this.binds = DOMUtils.bind(this.shadow);
		
		this.binds.add_button.onclick = e => this.on_add_material();
		this.binds.remove_button.onclick = e => this.remove_material(this.selected_material_id);

		this.selected_material_id;
		this.materials = [];

		this.value = new Uint8Array(256*256*3).fill(0);

		this.add_material();


		this.binds.editor.addEventListener('change', e => this.on_editor_update());

	}

	get_new_id(){
		let max_id = 0;
		for(const material of this.materials){
			max_id = Math.max(max_id, material.id);
		}
		return max_id + 1;
	}

	on_add_material(){
		console.log('add material');
		let material = this.add_material();
		this.binds.editor.albedo = material.albedo.slice();
		this.binds.editor.alpha = material.alpha.slice();
		this.binds.editor.anisotropy = material.anisotropy.slice();
		this.on_editor_update();
	}

	add_material(){
		const id = this.get_new_id();
		const material = {
			id: id,
			albedo: new Uint8Array(256).fill(127),
			alpha: new Uint8Array(256).fill(127),
			anisotropy: new Uint8Array(256).fill(127),
		};
		this.materials.push(material);

		let el = document.createElement('div');
		el.classList.add('material');
		el.id = `material_${id}`;
		el.onclick = e => this.select_material(id);

		this.binds.materials.appendChild(el);

		this.selected_material_id = id;

		this.update_selected_material();
		return material;
	}

	
	remove_material(id){
		if(this.materials.length === 1){
			return;
		}

		this.materials = this.materials.filter(material => material.id !== id);
		this.binds.materials.removeChild(this.shadow.getElementById(`material_${id}`));

		let material = this.materials[0];
		this.selected_material_id = material.id;
		this.binds.editor.albedo = material.albedo.slice();
		this.binds.editor.alpha = material.alpha.slice();
		this.binds.editor.anisotropy = material.anisotropy.slice();
		this.update_selected_material();
	}

	update_selected_material(){
		// remove all "selected" classes
		for(const material of this.materials){
			this.shadow.getElementById(`material_${material.id}`).classList.remove('selected');
		}

		// add "selected" class to selected
		this.shadow.getElementById(`material_${this.selected_material_id}`).classList.add('selected');
	}

	select_material(id){
		let material = this.materials.find(material => material.id === id);
		if(!material){
			return;
		}
		this.selected_material_id = material.id;
		this.binds.editor.albedo = material.albedo.slice();
		this.binds.editor.alpha = material.alpha.slice();
		this.binds.editor.anisotropy = material.anisotropy.slice();
		this.update_selected_material();
	}

	on_editor_update(){
		// update the material
		let material = this.materials.find(material => material.id === this.selected_material_id);
		if(!material){
			return;
		}

		material.albedo = this.binds.editor.albedo.slice();
		material.alpha = this.binds.editor.alpha.slice();
		material.anisotropy = this.binds.editor.anisotropy.slice();

		// update the icon color
		let rgb = spectrum_to_RGB(material.albedo, 400, 700);
		let selected_material_icon = this.shadow.getElementById(`material_${this.selected_material_id}`);
		selected_material_icon.style.backgroundColor = `rgb(${Math.floor(rgb.R*256)}, ${Math.floor(rgb.G*256)}, ${Math.floor(rgb.B*256)})`;


		
	}
}

customElements.define('ui-material-transfer-function', MaterialTransferFunction);
