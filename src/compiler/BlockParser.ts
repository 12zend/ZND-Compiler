import type { ScratchProjectJSON, ScratchTarget, ScratchBlock, PrimitiveValue } from '../types';
import type { 
  IRProgram, IRSprite, IRScript, IRBlock, IRValue, IRVariable, IRList,
  IRCostume, IRSound, ProgramMetadata, StaticAnalysisResult, AnalysisWarning
} from '../types/ir';
import { FastMap, StringInterner } from '../utils/datastruct';

const HAT_OPCODES = new Set([
  'event_whenflagclicked', 'event_whenkeypressed', 'event_whengreaterthan',
  'event_whenbroadcastreceived', 'event_whenbackdropswitchto',
  'control_start_as_clone', 'procedures_definition',
  'control_create_clone_of_menu', 'control_start_as_clone'
]);

const GPU_ELIGIBLE_OPCODES = new Set([
  'looks_gotofrontback', 'looks_gobackfront', 'looks_switchcostumeto',
  'looks_nextcostume', 'looks_seteffectto', 'looks_changeeffectby',
  'looks_hide', 'looks_show', 'looks_setsizeto', 'looks_changesizeby',
  'looks_switchbackdropto', 'looks_nextbackdrop',
  'motion_goto', 'motion_setx', 'motion_sety', 'motion_changexby',
  'motion_changeyby', 'motion_setrotationstyle', 'motion_turnright',
  'motion_turnleft', 'motion_pointindirection', 'motion_pointtowards',
  'motion_glideto', 'pen_penup', 'pen_pendown', 'pen_stamp'
]);

const COMPLEXITY_WEIGHTS: Record<string, number> = {
  'control_repeat': 10,
  'control_forever': 20,
  'control_wait': 5,
  'control_if': 5,
  'control_if_else': 8,
  'control_create_clone_of': 15,
  'control_stop': 1,
  'operator_random': 3,
  'operator_equals': 1,
  'operator_add': 1,
  'sensing_touchingcolor': 10,
  'sensing_coloristouchingcolor': 10,
  'video_videoon': 20,
  'pen_penup': 5,
  'pen_pendown': 5,
};

type NormalizedScratchBlock = ScratchBlock & { id: string };

export class BlockParser {
  private interner: StringInterner = new StringInterner();
  private blockMap: Map<string, NormalizedScratchBlock> = new Map();

  parse(projectJson: ScratchProjectJSON): IRProgram {
    this.blockMap.clear();

    for (const target of projectJson.targets) {
      if (target.blocks && typeof target.blocks === 'object') {
        for (const [blockId, rawBlock] of Object.entries(target.blocks)) {
          const block = this.normalizeBlock(blockId, rawBlock);
          if (block) {
            this.blockMap.set(block.id, block);
          }
        }
      }
    }

    const sprites = new FastMap<string, IRSprite>();
    const orderedSprites: IRSprite[] = [];
    const globalVariables = new Map<string, IRVariable>();
    const globalLists = new Map<string, IRList>();

    let hasCloudVariables = false;
    let hasPenExtension = projectJson.extensions.includes('pen');
    let hasVideoExtension = projectJson.extensions.includes('videoSensing');
    let hasTextToSpeech = projectJson.extensions.includes('text2speech');
    let totalComplexity = 0;

    for (const target of projectJson.targets) {
      const sprite = this.parseTarget(target, projectJson);
      sprites.set(target.name, sprite);
      orderedSprites.push(sprite);

      if (target.isStage) {
        for (const [id, variable] of Object.entries(target.variables)) {
          const irVar: IRVariable = {
            id,
            name: this.interner.intern(variable[0]),
            value: variable[1],
            isCloud: id.startsWith('Cloud:'),
            isLocal: false,
            ownerId: null
          };
          if (irVar.isCloud) hasCloudVariables = true;
          globalVariables.set(id, irVar);
        }
        for (const [id, list] of Object.entries(target.lists)) {
          globalLists.set(id, {
            id,
            name: this.interner.intern(list[0]),
            contents: [...list[1]],
            isLocal: false,
            ownerId: null
          });
        }
      }

      for (const script of sprite.scripts) {
        totalComplexity += this.analyzeScriptComplexity(script);
        if (this.scriptUsesOpcodePrefix(script.topBlock, 'pen_')) {
          hasPenExtension = true;
        }
      }
    }

    const metadata: ProgramMetadata = {
      hasCloudVariables,
      hasPenExtension,
      hasVideoExtension,
      hasTextToSpeech,
      estimatedComplexity: totalComplexity,
      estimatedMemoryUsage: this.estimateMemoryUsage(projectJson),
      gpuCompatible: true
    };

    return {
      id: projectJson.meta?.vm || 'unknown',
      sprites,
      globalVariables,
      globalLists,
      orderedSprites,
      metadata
    };
  }

  private parseTarget(target: ScratchTarget, projectJson: ScratchProjectJSON): IRSprite {
    const variables = new Map<string, IRVariable>();
    const lists = new Map<string, IRList>();
    const costumes: IRCostume[] = [];
    const sounds: IRSound[] = [];
    const scripts: IRScript[] = [];

    for (const [id, variable] of Object.entries(target.variables)) {
      const isCloud = id.startsWith('Cloud:');
      variables.set(id, {
        id,
        name: this.interner.intern(variable[0]),
        value: variable[1],
        isCloud,
        isLocal: !target.isStage,
        ownerId: target.name
      });
    }

    for (const [id, list] of Object.entries(target.lists)) {
      lists.set(id, {
        id,
        name: this.interner.intern(list[0]),
        contents: [...list[1]],
        isLocal: !target.isStage,
        ownerId: target.name
      });
    }

    for (const costume of target.costumes) {
      costumes.push({
        id: costume.assetId,
        name: this.interner.intern(costume.name),
        dataFormat: costume.dataFormat,
        rotationCenterX: costume.rotationCenterX,
        rotationCenterY: costume.rotationCenterY,
        bitmapResolution: costume.bitmapResolution,
        assetRef: costume.md5ext
      });
    }

    for (const sound of target.sounds) {
      sounds.push({
        id: sound.assetId,
        name: this.interner.intern(sound.name),
        assetRef: sound.md5ext,
        duration: sound.sampleCount / sound.rate
      });
    }

    const normalizedBlocks = target.blocks && typeof target.blocks === 'object'
      ? this.normalizeBlockMap(target.blocks)
      : {};

    const scriptsByTopBlock = this.findTopBlocks(normalizedBlocks);

    for (const topBlock of scriptsByTopBlock) {
      if (topBlock && this.isHatBlock(topBlock)) {
        const script = this.parseScript(topBlock, target.name, normalizedBlocks);
        if (script) {
          scripts.push(script);
        }
      }
    }

    return {
      id: target.name,
      name: this.interner.intern(target.name),
      scripts,
      variables,
      lists,
      costumes,
      sounds,
      defaultX: target.x,
      defaultY: target.y,
      defaultDirection: target.direction,
      defaultSize: target.size,
      defaultRotationStyle: target.rotationStyle,
      defaultVisible: target.visible,
      defaultDraggable: target.draggable,
      defaultCostumeIndex: target.currentCostume,
      isStage: target.isStage
    };
  }

  private findTopBlocks(blocks: Record<string, NormalizedScratchBlock>): NormalizedScratchBlock[] {
    if (!blocks) return [];

    const topBlocks: NormalizedScratchBlock[] = [];
    for (const block of Object.values(blocks)) {
      if (block.topLevel || !block.parent) {
        topBlocks.push(block);
      }
    }

    return topBlocks;
  }

  private isHatBlock(block: NormalizedScratchBlock): boolean {
    return HAT_OPCODES.has(block.opcode);
  }

  private parseScript(topBlock: NormalizedScratchBlock, targetId: string, blocks: Record<string, NormalizedScratchBlock>): IRScript | null {
    const blockById = new Map<string, NormalizedScratchBlock>();
    for (const block of Object.values(blocks)) {
      blockById.set(block.id, block);
    }

    const irTopBlock = this.parseBlock(topBlock, blockById);

    const parameterDefs: any[] = [];
    if (topBlock.opcode === 'procedures_definition') {
      const prototype = blockById.get(topBlock.inputs?.custom_block?.[1] as string);
      if (prototype?.mutation?.argumentids) {
        const argIds = JSON.parse(prototype.mutation.argumentids);
        const argNames = prototype.mutation.argumentnames 
          ? JSON.parse(prototype.mutation.argumentnames) 
          : [];
        const argDefaults = prototype.mutation.argumentdefaults
          ? JSON.parse(prototype.mutation.argumentdefaults)
          : [];

        for (let i = 0; i < argIds.length; i++) {
          parameterDefs.push({
            id: argIds[i],
            name: argNames[i] || argIds[i],
            type: 'string',
            defaultValue: argDefaults[i] ?? ''
          });
        }
      }
    }

    return {
      id: topBlock.id,
      targetId,
      blockId: topBlock.id,
      isHat: true,
      hatOpcode: topBlock.opcode,
      topBlock: irTopBlock,
      parameterDefs
    };
  }

  private parseBlock(block: NormalizedScratchBlock, blockById: Map<string, NormalizedScratchBlock>): IRBlock {
    const inputs: Record<string, IRValue | IRValue[]> = {};

    if (block.inputs) {
      for (const [name, input] of Object.entries(block.inputs)) {
        if (Array.isArray(input)) {
          const [, value] = input;
          const parsed = this.parseInputValue(value, blockById);
          if (parsed) {
            inputs[name] = parsed;
          }
        }
      }
    }

    const fields: Record<string, any> = {};
    if (block.fields) {
      for (const [name, field] of Object.entries(block.fields)) {
        const fieldValue = this.parseFieldValue(field);
        if (fieldValue !== null) {
          fields[name] = fieldValue.value;
          if (fieldValue.id) {
            fields[`${name}_id`] = fieldValue.id;
          }
        }
      }
    }

    let nextBlock: IRBlock | null = null;
    if (block.next) {
      const next = blockById.get(block.next);
      if (next) {
        nextBlock = this.parseBlock(next, blockById);
      }
    }

    return {
      id: block.id,
      type: this.getIRNodeType(block.opcode),
      opcode: block.opcode,
      fields,
      inputs,
      next: nextBlock,
      parent: null,
      comments: block.mutation?.text
    };
  }

  private isBlockReference(value: string): boolean {
    return value.length > 0 && !value.startsWith('_') && !value.startsWith('-');
  }

  private parseInputValue(
    value: unknown,
    blockById: Map<string, NormalizedScratchBlock>
  ): IRValue | IRValue[] | null {
    if (typeof value === 'string') {
      if (this.isBlockReference(value)) {
        const refBlock = blockById.get(value);
        if (refBlock) {
          return {
            type: 'block',
            value,
            blockRef: value,
            resolvedBlock: this.parseBlock(refBlock, blockById)
          };
        }
      }
      return { type: 'literal', value };
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return { type: 'literal', value };
    }

    if (!Array.isArray(value)) {
      return null;
    }

    if (value.length >= 2 && typeof value[0] === 'number') {
      for (let i = 1; i < value.length; i++) {
        const parsedPrimary = this.parseInputValue(value[i], blockById);
        if (parsedPrimary) {
          return parsedPrimary;
        }
      }
    }

    const parsedValues: IRValue[] = [];
    for (const item of value) {
      const parsed = this.parseInputValue(item, blockById);
      if (!parsed) {
        continue;
      }
      if (Array.isArray(parsed)) {
        parsedValues.push(...parsed);
      } else {
        parsedValues.push(parsed);
      }
    }

    if (parsedValues.length === 0) {
      return null;
    }

    return parsedValues.length === 1 ? parsedValues[0] : parsedValues;
  }

  private normalizeBlockMap(blocks: ScratchTarget['blocks']): Record<string, NormalizedScratchBlock> {
    const normalized: Record<string, NormalizedScratchBlock> = {};

    for (const [blockId, rawBlock] of Object.entries(blocks || {})) {
      const block = this.normalizeBlock(blockId, rawBlock);
      if (!block) {
        continue;
      }
      normalized[block.id] = block;
    }

    return normalized;
  }

  private normalizeBlock(blockId: string, rawBlock: ScratchTarget['blocks'][string]): NormalizedScratchBlock | null {
    if (!rawBlock || Array.isArray(rawBlock) || typeof rawBlock !== 'object') {
      return null;
    }

    return {
      ...rawBlock,
      id: rawBlock.id ?? blockId,
      fields: rawBlock.fields ?? {},
      inputs: rawBlock.inputs ?? {}
    };
  }

  private parseFieldValue(field: ScratchBlock['fields'][string]): { value: PrimitiveValue | string; id?: string } | null {
    if (Array.isArray(field)) {
      const [value, id] = field;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return {
          value,
          id: typeof id === 'string' ? id : undefined
        };
      }
      return null;
    }

    if (!field || typeof field !== 'object') {
      return null;
    }

    return {
      value: field.name,
      id: field.id
    };
  }

  private getIRNodeType(opcode: string): IRBlock['type'] {
    if (opcode.startsWith('operator_')) return 'operator';
    if (opcode.startsWith('motion_')) return 'motion';
    if (opcode.startsWith('looks_')) return 'looks';
    if (opcode.startsWith('sensing_')) return 'sensing';
    if (opcode.startsWith('pen_')) return 'pen';
    if (opcode.startsWith('control_')) return 'control';
    if (opcode.startsWith('event_')) return 'broadcast';
    if (opcode.startsWith('data_')) return 'expression';

    switch (opcode) {
      case 'control_repeat': return 'repeat';
      case 'control_forever': return 'forever';
      case 'control_wait': return 'wait';
      case 'control_if': return 'if';
      case 'control_if_else': return 'ifElse';
      case 'control_create_clone_of':
      case 'control_start_as_clone': return 'clone';
      case 'control_stop': return 'stop';
      case 'variables_setvariableto': return 'setVariable';
      case 'variables_changevariableby': return 'changeVariable';
      case 'data_addtolist': return 'addToList';
      case 'data_deleteoflist': return 'deleteOfList';
      case 'data_inserttolist': return 'insertOfList';
      case 'data_replaceitemoflist': return 'replaceOfList';
      case 'event_broadcast': return 'broadcast';
      case 'event_broadcastandwait': return 'broadcastAndWait';
      case 'procedures_call': return 'callCustomBlock';
      default: return 'noop';
    }
  }

  private analyzeScriptComplexity(script: IRScript): number {
    let complexity = 0;
    const stack: IRBlock[] = [script.topBlock];

    while (stack.length > 0) {
      const block = stack.pop()!;
      complexity += COMPLEXITY_WEIGHTS[block.opcode] || 1;

      if (block.next) stack.push(block.next);

      for (const input of Object.values(block.inputs)) {
        if (Array.isArray(input)) {
          for (const val of input) {
            if (val.blockRef) {
              const refBlock = this.blockMap.get(val.blockRef);
              if (refBlock) stack.push(this.parseBlock(refBlock, this.blockMap));
            }
          }
        } else if (input.blockRef) {
          const refBlock = this.blockMap.get(input.blockRef);
          if (refBlock) stack.push(this.parseBlock(refBlock, this.blockMap));
        }
      }
    }

    return complexity;
  }

  private estimateMemoryUsage(json: ScratchProjectJSON): number {
    let estimate = 0;

    for (const target of json.targets) {
      estimate += 500;

      for (const block of Object.values(target.blocks || {})) {
        if (block) estimate += 200;
      }

      for (const costume of target.costumes) {
        estimate += costume.dataFormat === 'svg' ? 5000 : 20000;
      }

      for (const sound of target.sounds) {
        estimate += sound.sampleCount * 2;
      }
    }

    return estimate;
  }

  private scriptUsesOpcodePrefix(block: IRBlock, prefix: string): boolean {
    const stack: IRBlock[] = [block];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current.opcode.startsWith(prefix)) {
        return true;
      }
      if (current.next) {
        stack.push(current.next);
      }
      for (const input of Object.values(current.inputs)) {
        const values = Array.isArray(input) ? input : [input];
        for (const value of values) {
          if (value.blockRef) {
            const refBlock = this.blockMap.get(value.blockRef);
            if (refBlock) {
              stack.push(this.parseBlock(refBlock, this.blockMap));
            }
          }
        }
      }
    }

    return false;
  }

  analyzeStatic(script: IRScript): StaticAnalysisResult {
    const warnings: AnalysisWarning[] = [];
    let hasSideEffects = false;
    let hasLoops = false;
    let hasBroadcast = false;
    let hasClone = false;

    const stack: IRBlock[] = [script.topBlock];

    while (stack.length > 0) {
      const block = stack.pop()!;

      if (block.type === 'forever' || block.type === 'repeat') {
        hasLoops = true;
        if (block.type === 'forever') {
          warnings.push({
            type: 'performance',
            code: 'INFINITE_LOOP',
            message: 'Infinite loop detected - may cause performance issues',
            location: { blockId: block.id }
          });
        }
      }

      if (block.type === 'broadcast' || block.type === 'broadcastAndWait') {
        hasBroadcast = true;
      }

      if (block.type === 'clone') {
        hasClone = true;
        warnings.push({
          type: 'performance',
          code: 'CLONE_CREATION',
          message: 'Clone creation - ensure proper cleanup to prevent memory leaks',
          location: { blockId: block.id }
        });
      }

      if (GPU_ELIGIBLE_OPCODES.has(block.opcode)) {
        hasSideEffects = true;
      }

      if (block.next) stack.push(block.next);

      for (const input of Object.values(block.inputs)) {
        if (Array.isArray(input)) {
          for (const val of input) {
            if (val.blockRef) {
              const refBlock = this.blockMap.get(val.blockRef);
              if (refBlock) stack.push(this.parseBlock(refBlock, this.blockMap));
            }
          }
        } else if (input.blockRef) {
          const refBlock = this.blockMap.get(input.blockRef);
          if (refBlock) stack.push(this.parseBlock(refBlock, this.blockMap));
        }
      }
    }

    return {
      hasSideEffects,
      hasLoops,
      hasBroadcast,
      hasClone,
      complexity: this.analyzeScriptComplexity(script),
      warnings
    };
  }
}

export const blockParser = new BlockParser();
