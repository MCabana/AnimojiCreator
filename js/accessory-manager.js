export function createAccessoryManager({
    THREE,
    GLTFLoader,
    getCharacter,
    getModelRoot,
    isCameraActive,
    drawScene
}) {
    const container = document.getElementById('accessory-selectors');
    const status = document.getElementById('accessory-status');
    const mountedAccessories = new Map();
    const accessoryLoadTokens = new Map();
    const selectedAccessoryIds = new Map();
    let accessoryCatalog = null;
    let rigBonesByName = new Map();
    let loadedCharacterId = null;
    let rigReady = false;

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.className = `mt-2 min-h-4 text-[10px] ${isError ? 'text-rose-600' : 'text-slate-500'}`;
    }

    function disposeModelResources(root) {
        if (!root) return;
        const geometries = new Set();
        const materials = new Set();
        const skeletons = new Set();
        root.traverse((child) => {
            if (!child.isMesh) return;
            if (child.geometry) geometries.add(child.geometry);
            for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
                if (material) materials.add(material);
            }
            if (child.isSkinnedMesh && child.skeleton) skeletons.add(child.skeleton);
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => {
            for (const value of Object.values(material)) {
                if (value?.isTexture) value.dispose();
            }
            material.dispose();
        });
        skeletons.forEach(skeleton => skeleton.dispose());
    }

    function disposeMountedAccessory(accessory) {
        if (!accessory) return;
        const geometries = new Set();
        const materials = new Set();
        accessory.meshes.forEach(mesh => {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.geometry) geometries.add(mesh.geometry);
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                if (material) materials.add(material);
            }
        });
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => {
            for (const value of Object.values(material)) {
                if (value?.isTexture) value.dispose();
            }
            material.dispose();
        });
        accessory.skeletons.forEach(skeleton => skeleton.dispose());
    }

    function clearMountedAccessories() {
        for (const slot of new Set([...accessoryLoadTokens.keys(), ...mountedAccessories.keys()])) {
            accessoryLoadTokens.set(slot, (accessoryLoadTokens.get(slot) || 0) + 1);
            disposeMountedAccessory(mountedAccessories.get(slot));
            mountedAccessories.delete(slot);
        }
        setStatus("");
    }

    function resetRig() {
        rigBonesByName = new Map();
        loadedCharacterId = null;
        rigReady = false;
        clearMountedAccessories();
    }

    function setRig(modelRoot, bonesByName, characterId) {
        rigBonesByName = bonesByName;
        loadedCharacterId = characterId;
        rigReady = Boolean(modelRoot && characterId && bonesByName.size > 0);
        if (rigReady && characterId === getCharacter()) applySelectedAccessories();
    }

    function mountAccessory(accessory, gltf) {
        const modelRoot = getModelRoot();
        if (!modelRoot || !rigReady) {
            throw new Error("Load the 3D core character before adding accessories.");
        }

        const accessoryRoot = gltf.scene;
        accessoryRoot.updateMatrixWorld(true);
        modelRoot.updateMatrixWorld(true);
        const meshes = [];
        accessoryRoot.traverse(child => {
            if (child.isMesh) meshes.push(child);
        });
        if (meshes.length === 0) throw new Error("The selected accessory contains no meshes.");

        const remappings = meshes.filter(mesh => mesh.isSkinnedMesh).map(mesh => {
            if (!mesh.skeleton) throw new Error(`Skinned mesh "${mesh.name}" has no skeleton.`);
            const sourceSkeleton = mesh.skeleton;
            const mappedBones = sourceSkeleton.bones.map(accessoryBone => {
                const boneName = accessoryBone.name?.trim().toLowerCase();
                const mappedBone = boneName ? rigBonesByName.get(boneName) : null;
                if (!mappedBone) {
                    throw new Error(boneName
                        ? `Core rig is missing accessory bone "${accessoryBone.name}".`
                        : "The accessory skeleton contains an unnamed bone.");
                }
                return mappedBone;
            });
            return {
                mesh,
                sourceSkeleton,
                skeleton: new THREE.Skeleton(mappedBones, sourceSkeleton.boneInverses)
            };
        });

        const skeletons = [];
        const sourceSkeletons = new Set();
        remappings.forEach(({ mesh, sourceSkeleton, skeleton }) => {
            mesh.bind(skeleton, mesh.bindMatrix);
            mesh.frustumCulled = false;
            skeletons.push(skeleton);
            sourceSkeletons.add(sourceSkeleton);
        });
        meshes.forEach(mesh => modelRoot.attach(mesh));
        accessoryRoot.clear();
        sourceSkeletons.forEach(skeleton => skeleton.dispose());
        return { id: accessory.id, meshes, skeletons };
    }

    function changeAccessory(slot, accessoryId) {
        const requestToken = (accessoryLoadTokens.get(slot) || 0) + 1;
        accessoryLoadTokens.set(slot, requestToken);
        const selectedCharacter = getCharacter();
        const accessory = accessoryCatalog?.accessories.find(item => item.id === accessoryId);
        if (!accessoryId) {
            disposeMountedAccessory(mountedAccessories.get(slot));
            mountedAccessories.delete(slot);
            selectedAccessoryIds.delete(slot);
            setStatus("");
            if (!isCameraActive()) drawScene();
            return;
        }

        if (!accessory || accessory.slot !== slot || !accessory.compatibleCharacters.includes(selectedCharacter)) {
            selectedAccessoryIds.delete(slot);
            setStatus("This accessory is not compatible with the selected character.", true);
            return;
        }
        selectedAccessoryIds.set(slot, accessoryId);
        if (!rigReady || !getModelRoot() || loadedCharacterId !== selectedCharacter) {
            setStatus("Loading the core character...");
            return;
        }
        if (mountedAccessories.get(slot)?.id === accessoryId) {
            setStatus("");
            return;
        }

        new GLTFLoader().load(new URL(accessory.model, document.baseURI).href, (gltf) => {
            if (requestToken !== accessoryLoadTokens.get(slot)
                || selectedAccessoryIds.get(slot) !== accessoryId
                || getCharacter() !== loadedCharacterId
                || !rigReady) {
                disposeModelResources(gltf.scene);
                return;
            }
            try {
                const mounted = mountAccessory(accessory, gltf);
                disposeMountedAccessory(mountedAccessories.get(slot));
                mountedAccessories.set(slot, mounted);
                setStatus("");
                if (!isCameraActive()) drawScene();
            } catch (error) {
                disposeModelResources(gltf.scene);
                console.error(`Could not attach accessory "${accessory.id}":`, error);
                selectedAccessoryIds.delete(slot);
                rebuildSelectors();
                setStatus(`Could not attach accessory: ${error.message}`, true);
            }
        }, undefined, (error) => {
            if (requestToken !== accessoryLoadTokens.get(slot)) return;
            console.error(`Could not load accessory "${accessory.id}":`, error);
            selectedAccessoryIds.delete(slot);
            rebuildSelectors();
            setStatus(`Could not load accessory: ${accessory.name}`, true);
        });
    }

    function applySelectedAccessories() {
        for (const [slot, accessoryId] of selectedAccessoryIds) {
            changeAccessory(slot, accessoryId);
        }
    }

    function rebuildSelectors() {
        const selectedCharacter = getCharacter();
        container.replaceChildren();
        if (!accessoryCatalog) return;

        const slots = [...new Set(accessoryCatalog.accessories.map(accessory => accessory.slot))].sort();
        for (const slot of slots) {
            const compatibleAccessories = accessoryCatalog.accessories
                .filter(accessory => accessory.slot === slot && accessory.compatibleCharacters.includes(selectedCharacter));
            const label = document.createElement('label');
            label.className = 'text-[10px] font-bold text-slate-500';
            label.textContent = slot.replace(/[-_]/g, ' ').toUpperCase();

            const select = document.createElement('select');
            select.id = `select-accessory-${slot}`;
            select.className = 'mt-1 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-2 text-xs font-medium text-slate-600';
            select.setAttribute('aria-label', `${slot} accessory`);
            const noneOption = document.createElement('option');
            noneOption.value = '';
            noneOption.textContent = 'None';
            select.append(noneOption);

            compatibleAccessories.forEach(accessory => {
                const option = document.createElement('option');
                option.value = accessory.id;
                option.textContent = accessory.name;
                select.append(option);
            });

            const selectedId = selectedAccessoryIds.get(slot);
            if (selectedId && compatibleAccessories.some(accessory => accessory.id === selectedId)) {
                select.value = selectedId;
            } else {
                selectedAccessoryIds.delete(slot);
                disposeMountedAccessory(mountedAccessories.get(slot));
                mountedAccessories.delete(slot);
                accessoryLoadTokens.set(slot, (accessoryLoadTokens.get(slot) || 0) + 1);
            }
            select.addEventListener('change', () => changeAccessory(slot, select.value));
            label.append(select);
            container.append(label);
        }

        if (!slots.length) {
            setStatus("No accessories are defined in models/accessories.json.");
        } else if (!accessoryCatalog.characters.some(character => character.id === selectedCharacter)) {
            setStatus(`No accessories are configured for "${selectedCharacter}".`);
        } else if (!accessoryCatalog.accessories.some(accessory => accessory.compatibleCharacters.includes(selectedCharacter))) {
            const character = accessoryCatalog.characters.find(item => item.id === selectedCharacter);
            setStatus(`No accessories are configured for ${character.name}.`);
        } else {
            setStatus("");
        }
    }

    function validateCatalog(data) {
        if (!data || !Array.isArray(data.characters) || !Array.isArray(data.accessories)) {
            throw new Error("Catalog must contain characters and accessories arrays.");
        }
        const characterIds = new Set();
        for (const character of data.characters) {
            if (!character || typeof character.id !== 'string' || !character.id.trim()
                || typeof character.name !== 'string' || !character.name.trim()
                || characterIds.has(character.id)) {
                throw new Error("Each character needs a unique id and a name.");
            }
            characterIds.add(character.id);
        }

        const accessoryIds = new Set();
        for (const accessory of data.accessories) {
            if (!accessory || typeof accessory.id !== 'string' || !accessory.id.trim()
                || accessoryIds.has(accessory.id)
                || typeof accessory.name !== 'string' || !accessory.name.trim()
                || typeof accessory.slot !== 'string' || !/^[a-z][a-z0-9_-]*$/i.test(accessory.slot)
                || typeof accessory.model !== 'string' || !accessory.model.trim()
                || !Array.isArray(accessory.compatibleCharacters)
                || accessory.compatibleCharacters.length === 0) {
                throw new Error("Each accessory needs a unique id, name, slot, model path, and compatibleCharacters list.");
            }
            if (accessory.compatibleCharacters.some(id => !characterIds.has(id))) {
                throw new Error(`Accessory "${accessory.id}" references a character missing from the characters list.`);
            }
            accessoryIds.add(accessory.id);
        }
        return data;
    }

    async function loadCatalog() {
        setStatus("Loading accessory catalog...");
        try {
            const response = await fetch(new URL('models/accessories.json', document.baseURI));
            if (!response.ok) throw new Error(`Catalog request failed with HTTP ${response.status}.`);
            accessoryCatalog = validateCatalog(await response.json());
            rebuildSelectors();
        } catch (error) {
            console.error("Could not load accessory catalog:", error);
            setStatus(`Accessory catalog error: ${error.message}`, true);
        }
    }

    return {
        loadCatalog,
        rebuildSelectors,
        resetRig,
        setRig,
        setStatus,
        disposeModelResources
    };
}
