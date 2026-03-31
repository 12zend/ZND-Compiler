import { BlockParser } from './BlockParser';
const GPU_PRIORITY = {
    'looks_switchcostumeto': 'high',
    'looks_nextcostume': 'high',
    'looks_show': 'high',
    'looks_hide': 'high',
    'motion_goto': 'high',
    'motion_pointindirection': 'high',
    'pen_stamp': 'high',
    'looks_seteffectto': 'medium',
    'looks_changesizeby': 'medium',
    'motion_glideto': 'low',
};
export class JSCodeGenerator {
    parser;
    varCounter = 0;
    labelCounter = 0;
    indentLevel = 0;
    indent() {
        return '  '.repeat(this.indentLevel);
    }
    constructor(parser) {
        this.parser = parser || new BlockParser();
    }
    generateProgram(ir) {
        const scripts = [];
        const globalInitCode = this.generateGlobalInit(ir);
        const spriteInitCode = new Map();
        const shaderSources = new Map();
        for (const sprite of ir.orderedSprites) {
            spriteInitCode.set(sprite.id, this.generateSpriteInit(sprite));
            for (const script of sprite.scripts) {
                const compiled = this.generateScript(sprite, script);
                scripts.push(compiled);
                if (compiled.staticAnalysis.warnings.length > 0) {
                    console.warn(`Script warnings for ${script.targetId}:`, compiled.staticAnalysis.warnings);
                }
            }
        }
        shaderSources.set('default', this.generateDefaultShader());
        return {
            ir,
            scripts,
            globalInitCode,
            spriteInitCode,
            shaderSources,
            assetManifest: [],
            version: '1.0.0'
        };
    }
    generateScript(sprite, script) {
        this.varCounter = 0;
        this.labelCounter = 0;
        const code = this.generateBlockCode(script.topBlock, {
            sprite,
            isAsync: script.hatOpcode === 'event_broadcastandwait',
            requiresYield: this.detectYield(script.topBlock)
        });
        const gpuOps = this.extractGPUOps(script.topBlock);
        const staticAnalysis = this.parser.analyzeStatic(script);
        return {
            scriptId: script.id,
            targetId: script.targetId,
            hatOpcode: script.hatOpcode,
            parameters: script.parameterDefs,
            compiledCode: {
                type: this.detectScriptType(script),
                code,
                requiredGlobals: this.collectGlobals(script.topBlock),
                requiredFunctions: this.collectFunctions(script.topBlock),
                gpuOps,
                estimatedCycles: staticAnalysis.complexity
            },
            dependencies: this.collectDependencies(script),
            staticAnalysis
        };
    }
    generateGlobalInit(ir) {
        const lines = [
            '// Global initialization',
            'const $globals = {',
        ];
        for (const [id, variable] of ir.globalVariables) {
            const safeName = this.sanitizeName(variable.name);
            lines.push(`  ${safeName}: ${JSON.stringify(variable.value)},`);
        }
        lines.push('};');
        return lines.join('\n');
    }
    generateSpriteInit(sprite) {
        const lines = [
            `// Sprite: ${sprite.name}`,
            `const ${this.getSpriteVarName(sprite.id)} = {`,
            `  x: ${sprite.defaultX},`,
            `  y: ${sprite.defaultY},`,
            `  direction: ${sprite.defaultDirection},`,
            `  size: ${sprite.defaultSize},`,
            `  rotationStyle: '${sprite.defaultRotationStyle}',`,
            `  visible: ${sprite.defaultVisible},`,
            `  draggable: ${sprite.defaultDraggable},`,
            `  costumeIndex: 0,`,
            `  layerOrder: ${sprite.isStage ? -1 : 0},`,
        ];
        if (sprite.variables.size > 0) {
            lines.push('  variables: {');
            for (const [id, variable] of sprite.variables) {
                const safeName = this.sanitizeName(variable.name);
                lines.push(`    ${safeName}: ${JSON.stringify(variable.value)},`);
            }
            lines.push('  },');
        }
        lines.push('};');
        return lines.join('\n');
    }
    generateBlockCode(block, ctx) {
        switch (block.type) {
            case 'start':
                return this.generateStartBlock(block, ctx);
            case 'wait':
                return this.generateWaitBlock(block, ctx);
            case 'repeat':
                return this.generateRepeatBlock(block, ctx);
            case 'forever':
                return this.generateForeverBlock(block, ctx);
            case 'if':
                return this.generateIfBlock(block, ctx);
            case 'ifElse':
                return this.generateIfElseBlock(block, ctx);
            case 'broadcast':
                return this.generateBroadcastBlock(block, ctx);
            case 'broadcastAndWait':
                return this.generateBroadcastWaitBlock(block, ctx);
            case 'setVariable':
                return this.generateSetVariableBlock(block, ctx);
            case 'changeVariable':
                return this.generateChangeVariableBlock(block, ctx);
            case 'operator':
                return this.generateOperatorBlock(block, ctx);
            case 'motion':
                return this.generateMotionBlock(block, ctx);
            case 'looks':
                return this.generateLooksBlock(block, ctx);
            case 'pen':
                return this.generatePenBlock(block, ctx);
            case 'expression':
                return this.generateExpressionBlock(block, ctx);
            case 'clone':
                return this.generateCloneBlock(block, ctx);
            case 'stop':
                return this.generateStopBlock(block, ctx);
            default:
                return this.generateGenericBlock(block, ctx);
        }
    }
    generateStartBlock(block, ctx) {
        if (!block.next)
            return '';
        return this.generateBlockCode(block.next, ctx);
    }
    generateWaitBlock(block, ctx) {
        const duration = this.evaluateInput(block.inputs.DURATION, ctx);
        const lines = [
            `yield* wait(${duration});`
        ];
        if (block.next) {
            lines.push(this.generateBlockCode(block.next, ctx));
        }
        return lines.join('\n' + this.indent());
    }
    generateRepeatBlock(block, ctx) {
        const times = this.evaluateInput(block.inputs.TIMES, ctx);
        const currentIndent = this.indent();
        this.indentLevel++;
        const subCode = block.inputs.SUBSTACK?.[0]
            ? this.generateBlockCode(block.inputs.SUBSTACK[0], ctx)
            : '';
        this.indentLevel--;
        const loopId = this.nextLabel();
        return [
            `for (let ${loopId}_i = 0; ${loopId}_i < ${times}; ${loopId}_i++) {`,
            this.indent() + subCode.split('\n').join('\n' + this.indent()),
            `${currentIndent}}`
        ].join('\n' + this.indent());
    }
    generateForeverBlock(block, ctx) {
        const currentIndent = this.indent();
        this.indentLevel++;
        const subCode = block.inputs.SUBSTACK?.[0]
            ? this.generateBlockCode(block.inputs.SUBSTACK[0], ctx)
            : '';
        this.indentLevel--;
        return [
            `while (!$stopped) {`,
            this.indent() + subCode.split('\n').join('\n' + this.indent()),
            `${currentIndent}}`
        ].join('\n' + this.indent());
    }
    generateIfBlock(block, ctx) {
        const condition = this.evaluateCondition(block.inputs.CONDITION, ctx);
        const currentIndent = this.indent();
        this.indentLevel++;
        const subCode = block.inputs.SUBSTACK?.[0]
            ? this.generateBlockCode(block.inputs.SUBSTACK[0], ctx)
            : '';
        this.indentLevel--;
        return [
            `if (${condition}) {`,
            this.indent() + subCode.split('\n').join('\n' + this.indent()),
            `${currentIndent}}`
        ].join('\n' + this.indent());
    }
    generateIfElseBlock(block, ctx) {
        const condition = this.evaluateCondition(block.inputs.CONDITION, ctx);
        const currentIndent = this.indent();
        this.indentLevel++;
        const thenCode = block.inputs.SUBSTACK?.[0]
            ? this.generateBlockCode(block.inputs.SUBSTACK[0], ctx)
            : '';
        const elseCode = block.inputs.SUBSTACK2?.[0]
            ? this.generateBlockCode(block.inputs.SUBSTACK2[0], ctx)
            : '';
        this.indentLevel--;
        return [
            `if (${condition}) {`,
            this.indent() + thenCode.split('\n').join('\n' + this.indent()),
            `${currentIndent}} else {`,
            this.indent() + elseCode.split('\n').join('\n' + this.indent()),
            `${currentIndent}}`
        ].join('\n' + this.indent());
    }
    generateBroadcastBlock(block, ctx) {
        const message = this.evaluateInput(block.inputs.BROADCAST_INPUT, ctx);
        const lines = [
            `$runtime.broadcast(${message});`
        ];
        if (block.next) {
            lines.push(this.generateBlockCode(block.next, ctx));
        }
        return lines.join('\n' + this.indent());
    }
    generateBroadcastWaitBlock(block, ctx) {
        const message = this.evaluateInput(block.inputs.BROADCAST_INPUT, ctx);
        const lines = [
            `yield* broadcastAndWait(${message});`
        ];
        if (block.next) {
            lines.push(this.generateBlockCode(block.next, ctx));
        }
        return lines.join('\n' + this.indent());
    }
    generateSetVariableBlock(block, ctx) {
        const varName = this.getVariableRef(block.fields.VARIABLE?.name || '', ctx);
        const value = this.evaluateInput(block.inputs.VALUE, ctx);
        const lines = [
            `${varName} = ${value};`
        ];
        if (block.next) {
            lines.push(this.generateBlockCode(block.next, ctx));
        }
        return lines.join('\n' + this.indent());
    }
    generateChangeVariableBlock(block, ctx) {
        const varName = this.getVariableRef(block.fields.VARIABLE?.name || '', ctx);
        const delta = this.evaluateInput(block.inputs.VALUE, ctx);
        const lines = [
            `${varName} = (${varName} || 0) + ${delta};`
        ];
        if (block.next) {
            lines.push(this.generateBlockCode(block.next, ctx));
        }
        return lines.join('\n' + this.indent());
    }
    generateOperatorBlock(block, ctx) {
        const result = this.generateOperator(block);
        if (block.next) {
            return result + '\n' + this.indent() + this.generateBlockCode(block.next, ctx);
        }
        return result;
    }
    generateOperator(block) {
        const opcode = block.opcode;
        switch (opcode) {
            case 'operator_add':
                return `(${this.getOperand(block.inputs.NUM1)} + ${this.getOperand(block.inputs.NUM2)})`;
            case 'operator_subtract':
                return `(${this.getOperand(block.inputs.NUM1)} - ${this.getOperand(block.inputs.NUM2)})`;
            case 'operator_multiply':
                return `(${this.getOperand(block.inputs.NUM1)} * ${this.getOperand(block.inputs.NUM2)})`;
            case 'operator_divide':
                return `(${this.getOperand(block.inputs.NUM1)} / ${this.getOperand(block.inputs.NUM2)})`;
            case 'operator_random': {
                const from = this.getOperand(block.inputs.FROM);
                const to = this.getOperand(block.inputs.TO);
                return `(Math.floor(${from}) + Math.random() * (Math.floor(${to}) - Math.floor(${from}) + 1))`;
            }
            case 'operator_lt':
                return `(${this.getOperand(block.inputs.OPERAND1)} < ${this.getOperand(block.inputs.OPERAND2)})`;
            case 'operator_equals':
                return `(${this.getOperand(block.inputs.OPERAND1)} === ${this.getOperand(block.inputs.OPERAND2)})`;
            case 'operator_gt':
                return `(${this.getOperand(block.inputs.OPERAND1)} > ${this.getOperand(block.inputs.OPERAND2)})`;
            case 'operator_and':
                return `(${this.getOperand(block.inputs.OPERAND1)} && ${this.getOperand(block.inputs.OPERAND2)})`;
            case 'operator_or':
                return `(${this.getOperand(block.inputs.OPERAND1)} || ${this.getOperand(block.inputs.OPERAND2)})`;
            case 'operator_not':
                return `(!${this.getOperand(block.inputs.OPERAND)})`;
            case 'operator_join':
                return `(String(${this.getOperand(block.inputs.STRING1)}) + String(${this.getOperand(block.inputs.STRING2)}))`;
            case 'operator_letter_of':
                return `String(${this.getOperand(block.inputs.LETTER)})[Math.floor(${this.getOperand(block.inputs.STRING)}) - 1] || ''`;
            case 'operator_length':
                return `String(${this.getOperand(block.inputs.STRING)}).length`;
            case 'operator_mod':
                return `(${this.getOperand(block.inputs.NUM1)} % ${this.getOperand(block.inputs.NUM2)})`;
            case 'operator_round':
                return `Math.round(${this.getOperand(block.inputs.NUM)})`;
            case 'operator_mathop': {
                const op = block.fields.OPERATOR?.name || 'abs';
                const num = this.getOperand(block.inputs.NUM);
                return `Math.${this.mathFunction(op)}(${num})`;
            }
            default:
                return 'null';
        }
    }
    mathFunction(op) {
        const map = {
            abs: 'abs', sqrt: 'sqrt', sin: 'sin', cos: 'cos', tan: 'tan',
            asin: 'asin', acos: 'acos', atan: 'atan', ln: 'log', log: 'log10',
            'e^': 'exp', '10^': 'pow10', floor: 'floor', ceil: 'ceil'
        };
        return map[op] || 'abs';
    }
    generateMotionBlock(block, ctx) {
        const sprite = this.getSpriteVarName(ctx.sprite.id);
        let code = '';
        switch (block.opcode) {
            case 'motion_movesteps':
                code = `${sprite}.move(${this.getOperand(block.inputs.STEPS)});`;
                break;
            case 'motion_goto':
                code = `${sprite}.gotoXY(${this.getOperand(block.inputs.TO)}, ${this.getOperand(block.inputs.Y)});`;
                break;
            case 'motion_goto_menu':
                code = `${sprite}.goto(${this.getOperand(block.inputs.TO)});`;
                break;
            case 'motion_setx':
                code = `${sprite}.x = ${this.getOperand(block.inputs.X)};`;
                break;
            case 'motion_sety':
                code = `${sprite}.y = ${this.getOperand(block.inputs.Y)};`;
                break;
            case 'motion_changexby':
                code = `${sprite}.x += ${this.getOperand(block.inputs.DX)};`;
                break;
            case 'motion_changeyby':
                code = `${sprite}.y += ${this.getOperand(block.inputs.DY)};`;
                break;
            case 'motion_pointindirection':
                code = `${sprite}.direction = ${this.getOperand(block.inputs.DIRECTION)};`;
                break;
            case 'motion_turnright':
                code = `${sprite}.direction += ${this.getOperand(block.inputs.DEGREES)};`;
                break;
            case 'motion_turnleft':
                code = `${sprite}.direction -= ${this.getOperand(block.inputs.DEGREES)};`;
                break;
            case 'motion_glideto':
                code = `${sprite}.glideTo(${this.getOperand(block.inputs.SECS)}, ${this.getOperand(block.inputs.TO)}, ${this.getOperand(block.inputs.Y)});`;
                break;
            case 'motion_glidemenu':
                code = `${sprite}.glideToTarget(${this.getOperand(block.inputs.TO)});`;
                break;
            case 'motion_setrotationstyle':
                code = `${sprite}.rotationStyle = '${block.fields.STYLE?.name || 'all-around'}';`;
                break;
            case 'motion_xposition':
                return `${sprite}.x`;
            case 'motion_yposition':
                return `${sprite}.y`;
            case 'motion_direction':
                return `${sprite}.direction`;
        }
        if (block.next) {
            code += '\n' + this.indent() + this.generateBlockCode(block.next, ctx);
        }
        return code;
    }
    generateLooksBlock(block, ctx) {
        const sprite = this.getSpriteVarName(ctx.sprite.id);
        let code = '';
        switch (block.opcode) {
            case 'looks_show':
                code = `${sprite}.visible = true;`;
                break;
            case 'looks_hide':
                code = `${sprite}.visible = false;`;
                break;
            case 'looks_switchcostumeto':
                code = `${sprite}.setCostume(${this.getOperand(block.inputs.COSTUME)});`;
                break;
            case 'looks_nextcostume':
                code = `${sprite}.nextCostume();`;
                break;
            case 'looks_changesizeby':
                code = `${sprite}.size += ${this.getOperand(block.inputs.CHANGE)};`;
                break;
            case 'looks_setsizeto':
                code = `${sprite}.size = ${this.getOperand(block.inputs.SIZE)};`;
                break;
            case 'looks_changeeffectby':
                code = `${sprite}.changeEffect('${block.fields.EFFECT?.name}', ${this.getOperand(block.inputs.CHANGE)});`;
                break;
            case 'looks_seteffectto':
                code = `${sprite}.setEffect('${block.fields.EFFECT?.name}', ${this.getOperand(block.inputs.VALUE)});`;
                break;
            case 'looks_cleargraphiceffects':
                code = `${sprite}.clearEffects();`;
                break;
            case 'looks_switchbackdropto':
                code = `$stage.setCostume(${this.getOperand(block.inputs.BACKDROP)});`;
                break;
            case 'looks_nextbackdrop':
                code = `$stage.nextCostume();`;
                break;
            case 'looks_gotofrontback':
                code = `${sprite}.goToLayer('${block.fields.FRONT_BACK?.name}');`;
                break;
            case 'looks_gobackfront':
                code = `${sprite}.goInFrontOf(${this.getOperand(block.inputs.UV)});`;
                break;
            case 'looks_costumenumbername':
                return block.fields.NUMBER_NAME?.name === 'number'
                    ? `${sprite}.costumeIndex + 1`
                    : `${sprite}.costumeName`;
            case 'looks_backdropnumbername':
                return block.fields.NUMBER_NAME?.name === 'number'
                    ? `$stage.costumeIndex + 1`
                    : `$stage.costumeName`;
            case 'looks_size':
                return `${sprite}.size`;
        }
        if (block.next) {
            code += '\n' + this.indent() + this.generateBlockCode(block.next, ctx);
        }
        return code;
    }
    generatePenBlock(block, ctx) {
        let code = '';
        switch (block.opcode) {
            case 'pen_penup':
                code = `$pen.down = false;`;
                break;
            case 'pen_pendown':
                code = `$pen.down = true;`;
                break;
            case 'pen_setpencolortocolor':
                code = `$pen.color = '${block.fields.COLOR?.name || '#000000'}';`;
                break;
            case 'pen_changepencolorby':
                code = `$pen.changeColor(${this.getOperand(block.inputs.COLOR)});`;
                break;
            case 'pen_changepensizeby':
                code = `$pen.size += ${this.getOperand(block.inputs.SIZE)};`;
                break;
            case 'pen_stamp':
                code = `$pen.stamp();`;
                break;
        }
        if (block.next) {
            code += '\n' + this.indent() + this.generateBlockCode(block.next, ctx);
        }
        return code;
    }
    generateExpressionBlock(block, ctx) {
        if (block.next) {
            return this.generateBlockCode(block.next, ctx);
        }
        return '';
    }
    generateCloneBlock(block, ctx) {
        const target = this.getOperand(block.inputs.CLONE_OPTION) || block.fields.CLONE_OPTION?.name;
        const lines = [
            `yield* clone('${target}');`
        ];
        if (block.next) {
            lines.push(this.generateBlockCode(block.next, ctx));
        }
        return lines.join('\n' + this.indent());
    }
    generateStopBlock(block, ctx) {
        const stopOption = block.fields.STOP_OPTION?.name || 'all';
        return `yield* stop('${stopOption}');`;
    }
    generateGenericBlock(block, ctx) {
        if (block.next) {
            return this.generateBlockCode(block.next, ctx);
        }
        return '';
    }
    evaluateInput(input, ctx) {
        if (!input)
            return 'null';
        if (Array.isArray(input)) {
            return input.map(i => this.evaluateInput(i, ctx)).join(') || (');
        }
        switch (input.type) {
            case 'literal':
                return JSON.stringify(input.value);
            case 'variable':
                return `variables['${input.value}']`;
            case 'list':
                return `lists['${input.value}']`;
            case 'parameter':
                return `params['${input.value}']`;
            case 'broadcast':
                return `broadcasts['${input.value}']`;
            case 'block':
                return `blocks['${input.value}']`;
            default:
                return 'null';
        }
    }
    getOperand(input) {
        return this.evaluateInput(input);
    }
    evaluateCondition(input, ctx) {
        const value = this.evaluateInput(input, ctx);
        return `!!(${value})`;
    }
    getVariableRef(name, ctx) {
        return `${this.getSpriteVarName(ctx.sprite.id)}.variables['${name}']`;
    }
    getSpriteVarName(id) {
        return `$sprite_${this.sanitizeName(id)}`;
    }
    sanitizeName(name) {
        return name.replace(/[^a-zA-Z0-9_]/g, '_');
    }
    nextLabel() {
        return `L${this.labelCounter++}`;
    }
    nextVar() {
        return `_v${this.varCounter++}`;
    }
    detectYield(block) {
        if (!block)
            return false;
        if (['wait', 'forever', 'broadcastAndWait', 'clone'].includes(block.type)) {
            return true;
        }
        if (block.next && this.detectYield(block.next)) {
            return true;
        }
        for (const input of Object.values(block.inputs)) {
            if (Array.isArray(input) && input.some(i => i.blockRef && this.detectYieldById(i.blockRef))) {
                return true;
            }
        }
        return false;
    }
    detectYieldById(blockId) {
        return false;
    }
    detectScriptType(script) {
        if (this.detectYield(script.topBlock)) {
            return 'generator';
        }
        for (const input of Object.values(script.topBlock.inputs)) {
            if (Array.isArray(input) && input.some(v => v.type === 'block')) {
                return 'async';
            }
        }
        return 'sync';
    }
    collectGlobals(block) {
        const globals = new Set();
        const collect = (b) => {
            for (const input of Object.values(b.inputs)) {
                if (Array.isArray(input)) {
                    for (const val of input) {
                        if (val.type === 'variable')
                            globals.add(val.value);
                    }
                }
                else if (input.type === 'variable') {
                    globals.add(input.value);
                }
            }
            if (b.next)
                collect(b.next);
        };
        collect(block);
        return Array.from(globals);
    }
    collectFunctions(block) {
        const functions = new Set();
        const collect = (b) => {
            if (b.opcode === 'procedures_call') {
                functions.add(b.fields.PROCCODE?.name || '');
            }
            if (b.next)
                collect(b.next);
        };
        collect(block);
        return Array.from(functions);
    }
    collectDependencies(script) {
        return [];
    }
    extractGPUOps(block) {
        const ops = [];
        const collect = (b) => {
            if (this.isGPUEligible(b.opcode)) {
                ops.push({
                    opcode: b.opcode,
                    target: b.parent ? '' : '',
                    params: { fields: b.fields, inputs: b.inputs },
                    priority: GPU_PRIORITY[b.opcode] || 'low',
                    batchable: true
                });
            }
            if (b.next)
                collect(b.next);
        };
        collect(block);
        return ops;
    }
    isGPUEligible(opcode) {
        return opcode.startsWith('looks_') || opcode.startsWith('motion_') ||
            opcode.startsWith('pen_') || opcode === 'video_videoon';
    }
    generateDefaultShader() {
        return `
      #version 300 es
      precision highp float;
      
      in vec2 a_position;
      in vec2 a_texCoord;
      
      uniform mat4 u_projection;
      uniform mat4 u_transform;
      uniform sampler2D u_texture;
      uniform float u_alpha;
      uniform vec4 u_color;
      
      out vec2 v_texCoord;
      out float v_alpha;
      out vec4 v_color;
      
      void main() {
        gl_Position = u_projection * u_transform * vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
        v_alpha = u_alpha;
        v_color = u_color;
      }
    `;
    }
}
export const codeGenerator = new JSCodeGenerator();
//# sourceMappingURL=JSCodeGenerator.js.map